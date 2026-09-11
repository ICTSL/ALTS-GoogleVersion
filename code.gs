function processAndSendDueInvoices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const clientsSheet = ss.getSheetByName("CLIENTS_TABLE");
  const servicesSheet = ss.getSheetByName("SERVICES_TABLE");
  const settingsSheet = ss.getSheetByName("SETTINGS");
  const templateSheet = ss.getSheetByName("INVOICE_TEMPLATE");

  if (!templateSheet) {
    throw new Error("INVOICE_TEMPLATE tab not found.");
  }

  const archiveFolder = getOrCreateFolder("Invoices_Archive");

  const clientsData = clientsSheet.getDataRange().getValues();
  const servicesData = servicesSheet.getDataRange().getValues();

  let currentCounter = Number(settingsSheet.getRange("B1").getValue()) || 1000;

  const dueClientsMap = {};

  for (let i = 1; i < servicesData.length; i++) {
    const clientName = String(servicesData[i][0]).trim();
    const serviceName = servicesData[i][1];
    const cost = Number(servicesData[i][2]) || 0;
    const activeStatus = String(servicesData[i][5]).trim();
    const emailDeterminant = Number(servicesData[i][9]);

    let qty = 1;
    if (servicesData[i].length > 10 && servicesData[i][10] !== "") {
      qty = Number(servicesData[i][10]) || 1;
    }

    let discount = 0;
    if (servicesData[i].length > 11 && servicesData[i][11] !== "") {
      discount = Number(servicesData[i][11]) || 0;
    }

    if (activeStatus === "Yes" && !isNaN(emailDeterminant) && emailDeterminant >= -1 && emailDeterminant <= 2) {
      if (!dueClientsMap[clientName]) {
        dueClientsMap[clientName] = [];
      }

      dueClientsMap[clientName].push({
        service: serviceName,
        qty: qty,
        unitPrice: cost,
        discount: discount
      });
    }
  }

  for (let j = 1; j < clientsData.length; j++) {
    const clientName = String(clientsData[j][0]).trim();

    if (dueClientsMap[clientName] && dueClientsMap[clientName].length > 0) {
      const clientMetadata = {
        name: clientName,
        email: clientsData[j][1],
        inCopy: clientsData[j][2],
        address1: clientsData[j][3],
        address2: clientsData[j][4],
        address3: clientsData[j][5]
      };

      if (!clientMetadata.email) continue;

      const currentYear = new Date().getFullYear();
      const invoiceNo = `ITS_${currentYear}_${currentCounter}`;
      const todayFormatted = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "d-MMM-yyyy");

      clientsSheet.getRange(j + 1, 7).setValue(invoiceNo);
      clientsSheet.getRange(j + 1, 8).setValue(todayFormatted);

      const tempSheet = templateSheet.copyTo(ss);
      tempSheet.setName(`TEMP_${invoiceNo}`);

      tempSheet.getRange("A7").setValue(clientMetadata.name);
      tempSheet.getRange("A8").setValue(clientMetadata.address1 || "");
      tempSheet.getRange("A9").setValue(clientMetadata.address2 || "");
      tempSheet.getRange("A10").setValue(clientMetadata.address3 || "");
      
      tempSheet.getRange("D7").setValue(currentCounter);
      tempSheet.getRange("E7").setValue(invoiceNo);
      tempSheet.getRange("F7").setValue(todayFormatted);

      tempSheet.getRange("A14:A18").clearContent();
      tempSheet.getRange("C14:E18").clearContent();

      const items = dueClientsMap[clientName];
      for (let k = 0; k < items.length; k++) {
        const row = 14 + k;
        tempSheet.getRange(row, 1).setValue(items[k].service);
        tempSheet.getRange(row, 3).setValue(items[k].qty);
        tempSheet.getRange(row, 4).setValue(items[k].unitPrice);
        tempSheet.getRange(row, 5).setValue(items[k].discount);
      }

      SpreadsheetApp.flush();

      const pdfBlob = exportSheetToPdf(ss.getId(), tempSheet.getSheetId(), `${invoiceNo}_${clientName}.pdf`);

      const subject = `Invoice ${invoiceNo} from ICT Solutions Limited - ${clientName}`;
      const emailBody = `Dear ${clientName},\n\nPlease find attached your invoice (${invoiceNo}) for upcoming service renewals.\n\nThank you for choosing ICT Solutions Limited.\n\nBest regards,\nICT Solutions Team`;

      const mailOptions = {
        attachments: [pdfBlob],
        name: "ICT Solutions Limited"
      };

      if (clientMetadata.inCopy) {
        mailOptions.cc = clientMetadata.inCopy;
      }

      GmailApp.sendEmail(clientMetadata.email, subject, emailBody, mailOptions);
      
      archiveFolder.createFile(pdfBlob);
      ss.deleteSheet(tempSheet);

      currentCounter++;
    }
  }

  settingsSheet.getRange("B1").setValue(currentCounter);
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function exportSheetToPdf(spreadsheetId, sheetId, pdfFileName) {
  const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/export?" +
    "exportFormat=pdf" +
    "&format=pdf" +
    "&size=letter" +
    "&portrait=true" +
    "&fitw=true" +
    "&gridlines=false" +
    "&printtitle=false" +
    "&sheetnames=false" +
    "&fpdf=false" +
    "&gid=" + sheetId;

  const params = {
    method: "GET",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, params);
  return response.getBlob().setName(pdfFileName);
}

