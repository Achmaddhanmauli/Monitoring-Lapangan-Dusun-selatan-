const FOLDER_FOTO_NAME = "BPARS_Foto_Kegiatan";

function doGet(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.tryLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureAllSheetsExist(ss);

    const limit = (e && e.parameter && e.parameter.limit) ? parseInt(e.parameter.limit, 10) : 2000;
    const sheetLaporan = ss.getSheetByName("Laporan");
    const lastRow = sheetLaporan.getLastRow();
    let reports = [];

    if (lastRow > 1) {
      const startRow = Math.max(2, lastRow - limit + 1);
      const numRows = lastRow - startRow + 1;
      const values = sheetLaporan.getRange(startRow, 1, numRows, 12).getValues();

      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        if (!row[1] && !row[2]) continue;
        reports.push({
          timestampServer: normalizeDateTimeStr(row[0]),
          namaPetugas: String(row[1] || "").trim(),
          jenisKegiatan: String(row[2] || "").trim(),
          kategoriMitra: String(row[3] || "").trim(),
          plafond: Number(row[4]) || 0,
          nominalPenagihan: Number(row[5]) || 0,
          waktuKegiatan: normalizeDateTimeStr(row[6]),
          keteranganKegiatan: String(row[7] || "").trim(),
          fotoUrl: String(row[8] || "").trim(),
          gps: String(row[9] || "").trim(),
          gpsAccuracy: String(row[10] || "0").trim(),
          clientId: String(row[11] || "").trim()
        });
      }
      reports.reverse();
    }

    const sheetTargets = ss.getSheetByName("Targets_KPI");
    const targetLastRow = sheetTargets.getLastRow();
    let targets = {};
    if (targetLastRow > 1) {
      const tValues = sheetTargets.getRange(2, 1, targetLastRow - 1, 2).getValues();
      for (let j = 0; j < tValues.length; j++) {
        if (tValues[j][0]) {
          targets[String(tValues[j][0]).trim()] = Number(tValues[j][1]) || 0;
        }
      }
    }

    return jsonResponse({
      status: "success",
      data: reports,
      targets: targets
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const rawBody = e && e.postData ? e.postData.contents : "{}";
    const data = JSON.parse(rawBody);
    const action = String(data.action || "save_report").trim();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureAllSheetsExist(ss);

    if (action === "login_pin") {
      return handleLoginPin(ss, data);
    }
    if (action === "register_pin") {
      return handleRegisterPin(ss, data);
    }
    if (action === "save_target") {
      return handleSaveTarget(ss, data);
    }
    if (action === "edit_report") {
      return handleEditReport(ss, data);
    }
    if (action === "delete_report") {
      return handleDeleteReport(ss, data);
    }

    return handleSaveReport(ss, data);
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function ensureAllSheetsExist(ss) {
  let sLaporan = ss.getSheetByName("Laporan");
  if (!sLaporan) {
    sLaporan = ss.insertSheet("Laporan");
    sLaporan.appendRow([
      "Timestamp Server",
      "Nama Petugas",
      "Jenis Kegiatan",
      "Kategori Mitra",
      "Plafond",
      "Nominal Penagihan",
      "Waktu Kegiatan",
      "Keterangan Kegiatan",
      "Foto URL",
      "Koordinat GPS",
      "Akurasi GPS (m)",
      "Client ID"
    ]);
  } else {
    const col12Header = String(sLaporan.getRange(1, 12).getValue() || "").trim();
    if (!col12Header) {
      sLaporan.getRange(1, 12).setValue("Client ID");
    }
  }

  let sUsers = ss.getSheetByName("Users_PIN");
  if (!sUsers) {
    sUsers = ss.insertSheet("Users_PIN");
    sUsers.appendRow(["Nama Petugas", "PIN", "Role", "Waktu Daftar"]);
  }

  let sTargets = ss.getSheetByName("Targets_KPI");
  if (!sTargets) {
    sTargets = ss.insertSheet("Targets_KPI");
    sTargets.appendRow(["Target Key", "Target Value", "Updated At"]);
  }

  let sLogHapus = ss.getSheetByName("Log_Hapus");
  if (!sLogHapus) {
    sLogHapus = ss.insertSheet("Log_Hapus");
    sLogHapus.appendRow([
      "Waktu Dihapus",
      "Dihapus Oleh",
      "Role Penghapus",
      "Client ID",
      "Nama Petugas",
      "Jenis Kegiatan",
      "Kategori Mitra",
      "Plafond",
      "Nominal Penagihan",
      "Waktu Kegiatan",
      "Keterangan Kegiatan",
      "Foto URL",
      "Koordinat GPS"
    ]);
  }
}

function handleLoginPin(ss, data) {
  const nama = String(data.namaPetugas || "").trim();
  const pinInput = String(data.pin || "").trim();
  const sheet = ss.getSheetByName("Users_PIN");
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return jsonResponse({ status: "not_registered", message: "Belum ada PIN terdaftar. Silakan daftar PIN baru." });
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    const rowNama = String(values[i][0] || "").trim();
    const rowPin = String(values[i][1] || "").replace(/^'/, "").trim();
    const rowRole = String(values[i][2] || "").trim() || (rowNama.toLowerCase() === "zidan" ? "BM" : "BP");

    if (rowNama.toLowerCase() === nama.toLowerCase()) {
      if (rowPin === pinInput) {
        return jsonResponse({
          status: "success",
          namaPetugas: rowNama,
          role: rowRole
        });
      } else {
        return jsonResponse({ status: "wrong_pin", message: "PIN yang Anda masukkan salah!" });
      }
    }
  }

  return jsonResponse({ status: "not_registered", message: "Nama petugas belum mendaftarkan PIN." });
}

function handleRegisterPin(ss, data) {
  const nama = String(data.namaPetugas || "").trim();
  const pinInput = String(data.pin || "").trim();
  if (!nama || !/^\d{4,6}$/.test(pinInput)) {
    return jsonResponse({ status: "error", message: "Nama dan PIN 4-6 digit wajib diisi." });
  }

  const sheet = ss.getSheetByName("Users_PIN");
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0] || "").trim().toLowerCase() === nama.toLowerCase()) {
        return jsonResponse({
          status: "already_registered",
          message: "Akun " + nama + " sudah memiliki PIN. Silakan masuk di tab Masuk (PIN)."
        });
      }
    }
  }

  const role = nama.toLowerCase() === "zidan" ? "BM" : "BP";
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([nama, "'" + pinInput, role, nowStr]);
  SpreadsheetApp.flush();

  return jsonResponse({
    status: "success",
    namaPetugas: nama,
    role: role
  });
}

function handleSaveTarget(ss, data) {
  const role = String(data.requesterRole || "").trim();
  if (role !== "BM") {
    return jsonResponse({ status: "forbidden", message: "Hanya Branch Manager (BM) yang dapat mengubah Target KPI." });
  }

  const targetKey = String(data.targetKey || "").trim();
  const targetVal = Number(data.targetVal) || 0;
  if (!targetKey) {
    return jsonResponse({ status: "error", message: "Target Key kosong." });
  }

  const sheet = ss.getSheetByName("Targets_KPI");
  const lastRow = sheet.getLastRow();
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0] || "").trim() === targetKey) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[targetVal, nowStr]]);
        SpreadsheetApp.flush();
        return jsonResponse({ status: "success" });
      }
    }
  }

  sheet.appendRow([targetKey, targetVal, nowStr]);
  SpreadsheetApp.flush();
  return jsonResponse({ status: "success" });
}

function handleSaveReport(ss, data) {
  const sheet = ss.getSheetByName("Laporan");
  const clientId = String(data.clientId || "").trim();

  if (clientId && sheet.getLastRow() > 1) {
    const existingIds = sheet.getRange(2, 12, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < existingIds.length; i++) {
      if (String(existingIds[i][0] || "").trim() === clientId) {
        return jsonResponse({ status: "duplicate_ignored", clientId: clientId });
      }
    }
  }

  let fotoUrl = "";
  if (data.foto && String(data.foto).indexOf("data:image") === 0) {
    fotoUrl = uploadBase64ToDrive(data.foto, data.namaPetugas, data.jenisKegiatan);
  }

  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([
    nowStr,
    String(data.namaPetugas || "").trim(),
    String(data.jenisKegiatan || "").trim(),
    String(data.kategoriMitra || "").trim(),
    Number(data.plafond) || 0,
    Number(data.nominalPenagihan) || 0,
    "'" + String(data.waktuKegiatan || "").trim(),
    String(data.keteranganKegiatan || "").trim(),
    fotoUrl,
    String(data.gps || "").trim(),
    String(data.gpsAccuracy || "0").trim(),
    clientId
  ]);
  SpreadsheetApp.flush();

  return jsonResponse({ status: "success", fotoUrl: fotoUrl, clientId: clientId });
}

function handleEditReport(ss, data) {
  const sheet = ss.getSheetByName("Laporan");
  const rowIndex = findMatchingReportRow(sheet, data);
  if (rowIndex === -1) {
    return jsonResponse({ status: "not_found", message: "Data laporan tidak ditemukan di sheet Laporan." });
  }

  const rowValues = sheet.getRange(rowIndex, 1, 1, 12).getValues()[0];
  const ownerName = String(rowValues[1] || "").trim().toLowerCase();
  const reqName = String(data.requesterName || "").trim().toLowerCase();
  const reqRole = String(data.requesterRole || "").trim();

  if (reqRole !== "BM" && ownerName !== reqName) {
    return jsonResponse({ status: "forbidden", message: "Tidak memiliki izin mengubah laporan ini." });
  }

  sheet.getRange(rowIndex, 4).setValue(String(data.kategoriMitra || "").trim());
  sheet.getRange(rowIndex, 5).setValue(Number(data.plafond) || 0);
  sheet.getRange(rowIndex, 6).setValue(Number(data.nominalPenagihan) || 0);
  sheet.getRange(rowIndex, 8).setValue(String(data.keteranganKegiatan || "").trim());
  SpreadsheetApp.flush();

  return jsonResponse({ status: "updated" });
}

function handleDeleteReport(ss, data) {
  const sheetLaporan = ss.getSheetByName("Laporan");
  const sheetLogHapus = ss.getSheetByName("Log_Hapus");

  const rowIndex = findMatchingReportRow(sheetLaporan, data);
  if (rowIndex === -1) {
    return jsonResponse({ status: "not_found", message: "Data laporan tidak ditemukan di sheet Laporan." });
  }

  const rowValues = sheetLaporan.getRange(rowIndex, 1, 1, 12).getValues()[0];
  const ownerName = String(rowValues[1] || "").trim().toLowerCase();
  const reqName = String(data.requesterName || "").trim().toLowerCase();
  const reqRole = String(data.requesterRole || "").trim();

  if (reqRole !== "BM" && ownerName !== reqName) {
    return jsonResponse({ status: "forbidden", message: "Tidak memiliki izin menghapus laporan ini." });
  }

  const waktuDihapus = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  sheetLogHapus.appendRow([
    waktuDihapus,
    String(data.requesterName || "").trim(),
    reqRole,
    String(rowValues[11] || data.clientId || "").trim(),
    String(rowValues[1] || "").trim(),
    String(rowValues[2] || "").trim(),
    String(rowValues[3] || "").trim(),
    Number(rowValues[4]) || 0,
    Number(rowValues[5]) || 0,
    "'" + normalizeDateTimeStr(rowValues[6]),
    String(rowValues[7] || "").trim(),
    String(rowValues[8] || "").trim(),
    String(rowValues[9] || "").trim()
  ]);

  sheetLaporan.deleteRow(rowIndex);
  SpreadsheetApp.flush();
  return jsonResponse({ status: "deleted", logSaved: true });
}

function normalizeText(str) {
  return String(str || "").replace(/\s+/g, " ").trim();
}

function findMatchingReportRow(sheet, data) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  const values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  const targetClientId = String(data.clientId || "").trim();
  const targetFotoUrl = String(data.fotoUrl || "").trim();
  const targetPetugas = String(data.namaPetugas || "").trim().toLowerCase();
  const targetJenis = String(data.jenisKegiatan || "").trim().toLowerCase();
  const targetWaktu = normalizeDateTimeStr(data.waktuKegiatan);
  const targetKet = normalizeText(data.oldKeterangan);

  // 1. Cocokkan berdasarkan Client ID
  if (targetClientId) {
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][11] || "").trim() === targetClientId) {
        return i + 2;
      }
    }
  }

  // 2. Cocokkan berdasarkan Foto URL Drive unik
  if (targetFotoUrl) {
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][8] || "").trim() === targetFotoUrl) {
        return i + 2;
      }
    }
  }

  // 3. Cocokkan berdasarkan Petugas + Jenis + Waktu + Keterangan
  for (let i = values.length - 1; i >= 0; i--) {
    const rPetugas = String(values[i][1] || "").trim().toLowerCase();
    const rJenis = String(values[i][2] || "").trim().toLowerCase();
    const rWaktu = normalizeDateTimeStr(values[i][6]);
    const rKet = normalizeText(values[i][7]);

    if (rPetugas === targetPetugas && rJenis === targetJenis && rWaktu === targetWaktu && rKet === targetKet) {
      return i + 2;
    }
  }

  // 4. Fallback untuk baris lama tanpa Client ID / Foto URL
  for (let i = values.length - 1; i >= 0; i--) {
    const rPetugas = String(values[i][1] || "").trim().toLowerCase();
    const rJenis = String(values[i][2] || "").trim().toLowerCase();
    const rWaktu = normalizeDateTimeStr(values[i][6]);

    if (rPetugas === targetPetugas && rJenis === targetJenis && rWaktu === targetWaktu) {
      return i + 2;
    }
  }

  return -1;
}

function normalizeDateTimeStr(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  }
  const str = String(val).replace(/^'/, "").trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) {
    return match[1] + " " + match[2];
  }
  return str;
}

function uploadBase64ToDrive(base64Data, namaPetugas, jenisKegiatan) {
  try {
    const split = base64Data.split(",");
    const contentType = split[0].match(/:(.*?);/)[1];
    const decoded = Utilities.base64Decode(split[1]);
    const fileName = "BPARS_" + (namaPetugas || "Petugas") + "_" + (jenisKegiatan || "Giat") + "_" + Date.now() + ".jpg";
    const blob = Utilities.newBlob(decoded, contentType, fileName);

    let folder;
    const folders = DriveApp.getFoldersByName(FOLDER_FOTO_NAME);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(FOLDER_FOTO_NAME);
    }

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/file/d/" + file.getId() + "/view?usp=sharing";
  } catch (err) {
    return "";
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
