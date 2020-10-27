var QUERY_NAME = "Most common words in all of Shakespeare's works";
// Replace this value with your Google Cloud API project ID
var PROJECT_ID = 'PROJECT_ID';
if (!PROJECT_ID) throw Error('Project ID is required in setup');

function runQuery() {
  var request = {
    query:
        'SELECT ' +
            'LOWER(word) AS word, ' +
            'SUM(word_count) AS count ' +
        'FROM [bigquery-public-data:samples.shakespeare] ' +
        'GROUP BY word ' +
        'ORDER BY count ' +
        'DESC LIMIT 10'
  };
  var queryResults = BigQuery.Jobs.query(request, PROJECT_ID);
  var jobId = queryResults.jobReference.jobId;

  // Wait for BQ job completion (with exponential backoff).
  var sleepTimeMs = 500;
  while (!queryResults.jobComplete) {
    Utilities.sleep(sleepTimeMs);
    sleepTimeMs *= 2;
    queryResults = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId);
  }

  // Get all results from BigQuery.
  var rows = queryResults.rows;
  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, {
      pageToken: queryResults.pageToken
    });
    rows = rows.concat(queryResults.rows);
  }

  // Return null if no data returned.
  if (!rows) {
    return Logger.log('No rows returned.');
  }

  // Create the new results spreadsheet.
  var spreadsheet = SpreadsheetApp.create(QUERY_NAME);
  var sheet = spreadsheet.getActiveSheet();

  // Add headers to Sheet.
  var headers = queryResults.schema.fields.map(function(field) {
    return field.name.toUpperCase();
  });
  sheet.appendRow(headers);

  // Append the results.
  var data = new Array(rows.length);
  for (var i = 0; i < rows.length; i++) {
    var cols = rows[i].f;
    data[i] = new Array(cols.length);
    for (var j = 0; j < cols.length; j++) {
      data[i][j] = cols[j].v;
    }
  }

  // Start storing data in row 2, col 1
  var START_ROW = 2;      // skip header row
  var START_COL = 1;
  sheet.getRange(START_ROW, START_COL, rows.length, headers.length).setValues(data);

  // Return the spreadsheet object for later use.
  return spreadsheet;
}


function createColumnChart(spreadsheet) {
  // Retrieve the populated (first and only) Sheet.
  var sheet = spreadsheet.getSheets()[0];
  // Data range in Sheet is from cell A2 to B11
  var START_CELL = 'A2';  // skip header row
  var END_CELL = 'B11';
  // Place chart on Sheet starting on cell E5.
  var START_ROW = 5;      // row 5
  var START_COL = 5;      // col E
  var OFFSET = 0;

  // Create & place chart on the Sheet using above params.
  var chart = sheet.newChart()
     .setChartType(Charts.ChartType.COLUMN)
     .addRange(sheet.getRange(START_CELL + ':' + END_CELL))
     .setPosition(START_ROW, START_COL, OFFSET, OFFSET)
     .build();
  sheet.insertChart(chart);

  // Return the chart object for later use.
  return chart;
}


function createSlidePresentation(spreadsheet, chart) {
  // Create the new presentation.
  var deck = SlidesApp.create(QUERY_NAME);

  // Populate the title slide.
  var [title, subtitle] = deck.getSlides()[0].getPageElements();
  title.asShape().getText().setText(QUERY_NAME);
  subtitle.asShape().getText().setText('via GCP and G Suite APIs:\n' +
    'Google Apps Script, BigQuery, Sheets, Slides');

  // Data range to copy is from cell A1 to B11
  var START_CELL = 'A1';  // include header row
  var END_CELL = 'B11';
  // Add the table slide and insert an empty table on it of
  // the dimensions of the data range; fails if Sheet empty.
  var tableSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  var sheetValues = spreadsheet.getSheets()[0].getRange(
      START_CELL + ':' + END_CELL).getValues();
  var table = tableSlide.insertTable(sheetValues.length, sheetValues[0].length);

  // Populate the table with spreadsheet data.
  for (var i = 0; i < sheetValues.length; i++) {
    for (var j = 0; j < sheetValues[0].length; j++) {
      table.getCell(i, j).getText().setText(String(sheetValues[i][j]));
    }
  }

  // Add a chart slide and insert the chart on it.
  var chartSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  chartSlide.insertSheetsChart(chart);

  // Return the presentation object for later use.
  return deck;
}

/**
 * Runs a BigQuery query, adds data and a chart in a Sheet,
 * and adds the data and chart to a new slide presentation.
 */
function createBigQueryPresentation() {
  var spreadsheet = runQuery();
  Logger.log('Results spreadsheet created: %s', spreadsheet.getUrl());
  var chart = createColumnChart(spreadsheet);
  var deck = createSlidePresentation(spreadsheet, chart);
  Logger.log('Results slide deck created: %s', deck.getUrl());
}
