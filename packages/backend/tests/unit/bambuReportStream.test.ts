import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { bambuCloudBroker } from "../../src/services/bambuCloudConnector.js";
import {
  createReportAccumulator,
  wireReportClient,
  type ReportTransport
} from "../../src/services/bambuReportStream.js";

class FakeTransport extends EventEmitter implements ReportTransport {
  subscribed: string[] = [];
  published: { topic: string; message: string }[] = [];
  ended = false;
  subscribe(topic: string): void {
    this.subscribed.push(topic);
  }
  publish(topic: string, message: string): void {
    this.published.push({ topic, message });
  }
  end(): void {
    this.ended = true;
  }
}

function fullReport(): unknown {
  return {
    print: {
      gcode_state: "RUNNING",
      mc_percent: 10,
      ams: {
        ams: [
          {
            id: "0",
            tray: [
              { id: "0", tray_type: "PLA", tray_color: "FF0000FF", remain: 80 },
              { id: "1", tray_type: "PETG", tray_color: "00FF00FF", remain: 50 }
            ]
          }
        ]
      },
      vt_tray: { tray_type: "TPU", tray_color: "0000FFFF", remain: 20 }
    }
  };
}

describe("createReportAccumulator (Teil-Reports der P1/A1-Serie)", () => {
  it("behaelt AMS-Fuellstand und Spulen, wenn ein Teil-Report nur den Fortschritt meldet", () => {
    const accumulate = createReportAccumulator("p1");
    accumulate(fullReport());
    const status = accumulate({ print: { mc_percent: 42 } });

    assert.ok(status);
    assert.equal(status.progressPercent, 42);
    assert.equal(status.printState, "running");
    assert.equal(status.amsSlots.length, 3);
    assert.equal(status.amsSlots.find((slot) => slot.slotIndex === 1)?.reportedMaterial, "PETG");
  });

  it("fuehrt eine geaenderte AMS-Kammer ueber ihre id in die bestehende Einheit ein", () => {
    const accumulate = createReportAccumulator("p1");
    accumulate(fullReport());
    const status = accumulate({ print: { ams: { ams: [{ id: "0", tray: [{ id: "1", remain: 33 }] }] } } });

    assert.ok(status);
    const slot1 = status.amsSlots.find((slot) => slot.slotIndex === 1);
    assert.equal(slot1?.remainingPercent, 33);
    assert.equal(slot1?.reportedMaterial, "PETG");
    assert.equal(status.amsSlots.find((slot) => slot.slotIndex === 0)?.remainingPercent, 80);
  });

  it("uebernimmt eine neu eingelegte Spule (geaendertes Material) und ignoriert Reports ohne print", () => {
    const accumulate = createReportAccumulator("p1");
    accumulate(fullReport());
    assert.equal(accumulate({ info: { command: "get_version" } }), null);
    const status = accumulate({ print: { ams: { ams: [{ id: "0", tray: [{ id: "0", tray_type: "ABS" }] }] } } });
    assert.equal(status?.amsSlots.find((slot) => slot.slotIndex === 0)?.reportedMaterial, "ABS");
  });

  it("trennt die Staende zweier Drucker", () => {
    const first = createReportAccumulator("a");
    const second = createReportAccumulator("b");
    first(fullReport());
    assert.equal(second({ print: { mc_percent: 5 } })?.amsSlots.length, 0);
  });
});

describe("wireReportClient", () => {
  function wire(onAuthRejected?: () => void): { transport: FakeTransport; statuses: PrinterLiveStatus[] } {
    const transport = new FakeTransport();
    const statuses: PrinterLiveStatus[] = [];
    wireReportClient(transport, { printerId: "p1", serialNumber: "SER123" }, (status) => statuses.push(status), onAuthRejected);
    return { transport, statuses };
  }

  it("abonniert den Report des Druckers und fragt nach dem Verbinden den vollen Stand an (pushall)", () => {
    const { transport } = wire();
    transport.emit("connect");

    assert.deepEqual(transport.subscribed, ["device/SER123/report"]);
    assert.equal(transport.published.length, 1);
    assert.equal(transport.published[0]?.topic, "device/SER123/request");
    const payload: unknown = JSON.parse(transport.published[0]?.message ?? "{}");
    assert.deepEqual(payload, { pushing: { sequence_id: "0", command: "pushall", version: 1, push_target: 1 } });
  });

  it("meldet den Status aus den Reports und fasst Teil-Reports zusammen", () => {
    const { transport, statuses } = wire();
    transport.emit("message", "device/SER123/report", Buffer.from(JSON.stringify(fullReport())));
    transport.emit("message", "device/SER123/report", Buffer.from(JSON.stringify({ print: { mc_percent: 99 } })));

    assert.equal(statuses.length, 2);
    assert.equal(statuses[1]?.progressPercent, 99);
    assert.equal(statuses[1]?.amsSlots.length, 3);
  });

  it("ueberlebt kaputte Nachrichten", () => {
    const { transport, statuses } = wire();
    transport.emit("message", "device/SER123/report", Buffer.from("kein json"));
    transport.emit("message", "device/SER123/report", Buffer.from(JSON.stringify(fullReport())));
    assert.equal(statuses.length, 1);
  });

  it("beendet die Verbindung und meldet es, wenn der Broker die Zugangsdaten ablehnt (MQTT-Code 4/5)", () => {
    let rejected = 0;
    const { transport } = wire(() => {
      rejected += 1;
    });
    transport.emit("error", Object.assign(new Error("Connection refused: Not authorized"), { code: 5 }));

    assert.equal(rejected, 1);
    assert.equal(transport.ended, true);
  });

  it("laesst die Verbindung bei anderen Fehlern bestehen (Netzwerk-Hickser)", () => {
    let rejected = 0;
    const { transport } = wire(() => {
      rejected += 1;
    });
    transport.emit("error", Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }));

    assert.equal(rejected, 0);
    assert.equal(transport.ended, false);
  });
});

describe("bambuCloudBroker", () => {
  it("nimmt den Broker je Region und den Benutzer aus der Nutzer-ID - nie aus Eingaben des Clients", () => {
    const global = bambuCloudBroker("global", "12345");
    assert.equal(global.url, "mqtts://us.mqtt.bambulab.com:8883");
    assert.equal(global.username, "u_12345");
    assert.equal(bambuCloudBroker("china", "12345").url, "mqtts://cn.mqtt.bambulab.com:8883");
  });
});
