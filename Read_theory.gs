var logSheetName = "event-log";
var loginURL = "https://readtheory.org/auth/doLogin";
var username = "sonalika@navgurukul.org";
var password = "Ssona0603";
//var username = "anup@navgurukul.org";
//var password = "anup@123";

const LOG_LEVEL_DEBUG = 1;
const LOG_LEVEL_ERROR = 2;

const logging_level = LOG_LEVEL_ERROR;

function logEvent(msg, logLevel = LOG_LEVEL_ERROR) {
  if (logLevel >= logging_level) {
    if (getSheet(logSheetName) == null) {
      insertNewTab(logSheetName);
      addDataToSheet([[
        "DATE",
        "LOG_LEVEL",
        "MESSAGE"
      ]], logSheetName);
    }
    let log_string = "";
    switch (logLevel) {
      case LOG_LEVEL_ERROR:
        log_string = "ERROR";
        break;
      case LOG_LEVEL_DEBUG:
        log_string = "DEBUG";
        break;
      default:
        log_string = "ERROR";
    }
    addDataToSheet([[new Date().toISOString(), log_string, msg]], logSheetName);
  }
}

function fetchHTTPResponse(url, options) {
  logEvent("In fetchHTTPResponse: Fetching url -" + url, LOG_LEVEL_DEBUG);
  var response = UrlFetchApp.fetch(url, options);
  Logger.log("In fetchHTTPResponse: response -" + response);
  return (response);
}

function fetchCookie(response) {
  headers = response.getAllHeaders();
  cookies = headers['Set-Cookie'];
  for (i in cookies) {
    cookies[i] = cookies[i].split(";")[0];
  }
  cookies = cookies.join(";");
  logEvent(cookies, LOG_LEVEL_DEBUG);
  return (cookies);
}

function fetchAuthenticatedCookie() {
  var data = {
    "j_username": username,
    "j_password": password,
    "ajaxLogin": "Log in"
  };
  var options = {
    "method": "POST",
    "payload": data,
    'followRedirects': false,
    muteHttpExceptions: true
  };
  response = fetchHTTPResponse(loginURL, options);
  return fetchCookie(response);
}

function fetchTeacherId(response) {
  html = response.getContentText()
  var match = html.match(/"teacherId":\s*(\d+)/)
  // Logger.log(match)
  if (match && match[1]) {
    const number = parseInt(match[1]).toString();
    // Logger.log(number)
    return (number);
  };
}

function fetchAuthorizationToken(response) {
  var html = response.getContentText();
  var match = html.match(/"authorization":"([^"]+)"/);
  if (match && match[1]) {
    var authorizationValue = match[1];
    logEvent(authorizationValue, LOG_LEVEL_DEBUG);
    return (authorizationValue);
  };
}

function fetchTeacherIdAndAuthorisationKeys() {
  var studentsURL = 'https://readtheory.org/app/student/list';
  var cookie = fetchAuthenticatedCookie();
  var dataHeaders = {
    'Cookie': cookie
  };
  var options = {
    'method': 'GET',
    'headers': dataHeaders,
    muteHttpExceptions: true
  };
  response = fetchHTTPResponse(studentsURL, options)
  let teacherId = fetchTeacherId(response);
  let token = fetchAuthorizationToken(response);
  return [teacherId, cookie, token];
}

function fetchMyClassesListJson(teacherId, token) {
  var classDataURL = 'https://prod.readtheory.org/class/teacher/' + teacherId;
  var options = {
    'method': 'GET',
    'headers': { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  };
  response = fetchHTTPResponse(classDataURL, options);
  return JSON.parse(response.getContentText());
}

function fetchMyStudentsListJson() {
  var [teacherId, cookie, token] = fetchTeacherIdAndAuthorisationKeys();
  var studentsDataURL = 'https://prod.readtheory.org/class/teacher/' + teacherId + '/students'
  var options = {
    'method': 'GET',
    'headers': { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  };
  response = fetchHTTPResponse(studentsDataURL, options);
  return [JSON.parse(response.getContentText()), cookie, token, teacherId];
}

function fetchStudentIds(jsonObject) {
  var studentIds = [];
  for (let i in jsonObject) {
    var studentId = jsonObject[i]['id'].toString();
    studentIds.push(studentId);
  }
  // Logger.log(studentIds)
  return studentIds
}

function fetchValuesInRange(sheet_name, range) {
  return getSheet(sheet_name).getRange(range).getValues();
}

function fetchCellValues(sheet_name, range) {
  var values = fetchValuesInRange(sheet_name, range);
  var result = [];
  for (var row in values) {
    for (var col in values[row]) {
      if (values[row][col])
        result.push(values[row][col].toString());
    }
  }
  //Logger.log(result);
  return result;
}

function readStudentIdsFromSheet(sheet_name) {
  var student_ids = fetchCellValues(sheet_name, "A2:A");
  return student_ids;
}

function fetchSavedStudentIds() {
  const date = getTodaysDate();
  if (getSheet(date) != null) {
    return readStudentIdsFromSheet(date);
  } else
    return null;
}

function fetchStudentData(processData, function_data) {
  let [jsonObject, cookie, token, teacherId] = fetchMyStudentsListJson();
  let classes = fetchMyClassesListJson(teacherId, token);
  let studentIds = fetchStudentIds(jsonObject);
  let studentIdsSaved = fetchSavedStudentIds();

  studentIds = studentIds.filter(x => !studentIdsSaved.includes(x));
  console.log("180",studentIds)

  for (let i in studentIds) {
    studentId = (studentIds[i])
    var singleStudentDataURL = 'https://readtheory.org/dashboard/viewProfileForStudent';
    var data = {
      "studentId": studentId,
      "beginDateString": undefined,
      "endDateString": undefined,
      "jsonFormat": true
    };

    var dataHeaders = {
      'Cookie': cookie,
      'Authorization': 'Bearer ' + token,
      'Referer': "https://readtheory.org/app/teacher/reports/student/" + studentId,
      'x-requested-with': 'XMLHttpRequest'
    };

    var options = {
      "method": "POST",
      "payload": data,
      'followRedirects': false,
      'headers': dataHeaders,
      muteHttpExceptions: true
    };

    response = fetchHTTPResponse(singleStudentDataURL, options);
    try {
      let jsonObject = JSON.parse(response);
      console.log("210***",jsonObject)
      processData([getStudentdData(jsonObject.data.command, classes)], function_data);
    } catch (e) {
      logEvent("Error in fetchStudentData, " + e.name + ": " + e.message + "for studentid - " + studentId, LOG_LEVEL_ERROR);
      logEvent("Error in fetchStudentData, " + e.name + ": " + e.message + "response - " + response, LOG_LEVEL_ERROR);
    }
    Utilities.sleep(1000);
  }
}

function getStudentClassData(classIds, classes) {
  // let classes = fetchMyClassesListJson(teacherId, token);
  let student_classes = "";
  let student_class_max = "";
  let max = -1;
  for (let i in classIds) {
    let classId = classIds[i];
    for (let j in classes) {
      let clas = classes[j];
      if (clas.id == classId) {
        student_classes = [student_classes, clas.name].filter(Boolean).join(", ");
        if (clas.students && clas.students > max) {
          max = clas.students;
          student_class_max = clas.name;
        }
        break;
      }
    }
  }
  return [student_classes, student_class_max];
}

function getStudentdData(index, classes) {
  Logger.log(index);
  let [student_classes, student_class_max] = getStudentClassData(index.classIds, classes);
  let result = [
    index.studentId.toString(),
    index.username,
    index.firstName + " " + index.lastName,
    index.email,
    student_classes,
    student_class_max,
    (index.lastLoginDate ? index.lastLoginDate.split("T")[0] : ""),
    index.currentLevel,
    index.initialLevel,
    index.highestLevel,
    index.initialLexileLevel,
    index.averageLexileLevel,
    index.averageQuizLevel,
    index.quizzesAboveInitialGradeLevel,
    index.quizzesBelowInitialGradeLevel,
    index.quizzesCompleted,
    index.quizzesPassed,
    index.quizzesFailed,
    index.pointsEarned,
    index.totalPoints,
  ];
  logEvent(result, LOG_LEVEL_DEBUG);
  return result;
}

function getActiveSs() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function insertNewTab(name) {
  ss = getActiveSs().insertSheet();
  ss.setName(name);
}

function getSheet(name) {
  var ss = getActiveSs();
  return ss.getSheetByName(name); //The name of the sheet tab where you are sending the info
}

function addDataToSheet(data, sheet_name) {
  var sheet = getSheet(sheet_name);
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, data.length, data[0].length).setValues(data);
}

function getTodaysDate() {
  var date = new Date(); // Or the date you'd like converted.
  var isoDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString();
  const dateTimeInParts = isoDateTime.split("T");
  return dateTimeInParts[0];
}

function copyDataBetweenSheets(source, destination) {
  let sourceSheet = getSheet(source);
  let destinationSheet = getSheet(destination);
  let rangeToCopy = sourceSheet.getDataRange();
  let valuesToCopy = rangeToCopy.getValues();
  let destinationRange = destinationSheet.getRange(1, 1, valuesToCopy.length, valuesToCopy[0].length);
  destinationRange.clear();
  destinationRange.setValues(valuesToCopy);
}

function updateStudentData() {
  const date = getTodaysDate();
  if (getSheet(date) == null) {
    insertNewTab(date);
    addDataToSheet([[
      "studentId",
      "username",
      "name",
      "email",
      "classes",
      "classMax",
      "lastLoginDate",
      "currentLevel",
      "initialLevel",
      "highestLevel",
      "initialLexileLevel",
      "averageLexileLevel",
      "averageQuizLevel",
      "quizzesAboveInitialGradeLevel",
      "quizzesBelowInitialGradeLevel",
      "quizzesCompleted",
      "quizzesPassed",
      "quizzesFailed",
      "pointsEarned",
      "totalPoints",
    ]], date);
  }
  fetchStudentData(addDataToSheet, date);
  copyDataBetweenSheets(date, "latest");
}

function fetchClassData(token, teacherId) {
  var teacherDataURL = 'https://api.readtheory.org/class/teacher/' + teacherId;
  Logger.log(token);
  Logger.log(teacherId);
  var options = {
    'method': 'GET',
    'headers': { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  };
  response = fetchHTTPResponse(teacherDataURL, options);
  let jsonObject = JSON.parse(response);
  Logger.log(jsonObject)
  return (jsonObject);
}
