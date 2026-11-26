const HEADERS = ['ID', 'Project', 'Status', 'Notes', 'Updated'];
const STATUSES = ['Planning', 'Active', 'Completed'];

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw Error('Run setup from the script attached to your Google Sheet.');
  let tab = book.getSheetByName('Brik Projects');
  if (!tab) tab = book.insertSheet('Brik Projects');
  if (!tab.getLastRow()) {
    tab.appendRow(HEADERS);
    tab.setFrozenRows(1);
  }
  verify_(tab);
  PropertiesService.getScriptProperties().setProperty('BOOK_ID', book.getId());
}

function verify_(tab) {
  if (!tab || tab.getRange(1, 1, 1, 5).getDisplayValues()[0].join('|') !== HEADERS.join('|'))
    throw Error('Check the Brik Projects tab and its column headings.');
}

function tab_() {
  const id = PropertiesService.getScriptProperties().getProperty('BOOK_ID');
  if (!id) throw Error('Run setup in the Apps Script editor first.');
  const tab = SpreadsheetApp.openById(id).getSheetByName('Brik Projects');
  verify_(tab);
  return tab;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Brik · Projects').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function listProjects() {
  const tab = tab_();
  if (tab.getLastRow() < 2) return [];
  return tab.getRange(2, 1, tab.getLastRow() - 1, 5).getDisplayValues().filter(row => row[0]);
}

function saveProject(p) {
  if (!p || !/^[a-f0-9-]{36}$/i.test(p.id) || typeof p.title !== 'string' ||
      !p.title.trim() || p.title.length > 120 || typeof p.notes !== 'string' ||
      p.notes.length > 4000 || !STATUSES.includes(p.status)) throw Error('Check the project fields.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const tab = tab_();
    const count = tab.getLastRow() - 1;
    const rows = count ? tab.getRange(2, 1, count, 5).getDisplayValues() : [];
    const index = rows.findIndex(row => row[0] === p.id);
    const title = p.title.trim();
    if (index >= 0 && rows[index][1] === title && rows[index][2] === p.status && rows[index][3] === p.notes) return;
    if ((index >= 0 ? rows[index][4] : '') !== p.version)
      throw Error('This project changed. Reload the list before editing again.');
    const target = tab.getRange(index < 0 ? rows.length + 2 : index + 2, 1, 1, 5);
    target.setNumberFormat('@');
    const literal = s => /^[=+'@-]/.test(s) ? "'" + s : s;
    target.setValues([[p.id, literal(title), p.status, literal(p.notes), new Date().toISOString()]]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}
