function getTextAndUpdate(url, success, error) {
  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function () {
    if (this.readyState == 4) {
      if (this.status == 200) {
        success(this.responseText);
      } else {
        error();
      }
    }
  };
  xhttp.open("GET", url, true);
  xhttp.setRequestHeader('Content-type', 'application/json; charset=utf-8');
  xhttp.setRequestHeader('Accept', 'text/plain');
  xhttp.send();
}
function setInnerHtml(id, html) {
  document.getElementById(id).innerHTML = html;
}
function trimQuotes(value) {
  return value.replace(/^"(.*)"$/, '$1')
}

// csv files have a date and name and a bunch of stats which are numbers 
function convertKnownField(fieldname, value) {
  if (fieldname == 'Date') {
    const simple = trimQuotes(value).split("T")[0] + "T12:00:00+00:00";
    return new Date(simple).toLocaleDateString('en-us');
  }
  if (fieldname == 'Name') {
    const trim_end_slash = trimQuotes(value).replace(/^(.*)\/$/, '$1')
    const names = trim_end_slash.split("/");
    const simple_name = names[names.length-1];  // rm redhat-actions prefix   
    return simple_name;
  }
  return parseInt(value);
}

const action_name_map = { 
  "serviceberries": "saskatoons"
};

const noMerge = window.location.href.includes("nomerge");
function nameAlias(name) {
  if (noMerge) return name;
  var mergedName = action_name_map[name];
  if (mergedName) return mergedName;
  return name;
};

function generateColours() {
  var c = [];
  const red = [255, 100];
  const green = [100, 0, 200];
  const blue = [132, 255, 200, 0];

  // for (var r = 255; r > 0; r -= 100)
  // for (var g = 255; g > 0; g -= 100)
  //   for (var b = 255; b > 0; b -= 100)
  for (const r of red)
    for (const b of blue)
      for (const g of green) {
        if (r != g && r != b) {
          var cc = 'rgb(' + r + ',' + g + ',' + b + ')';
          c.push(cc);
        }
      }
  return c;
}
function ActionsData() {
  this.labels = [];
  this.data = [];
  this.graph_coloursx = generateColours();
  this.graph_colours = [
    'rgb(255, 99, 132)',
    'rgb(255, 150, 64)',
    'rgb(255, 205, 86)',
    'rgb(75, 192, 192)',
    'rgb(54, 162, 215)',
    'rgb(153, 80, 255)',
    'rgb(201, 203, 207)',
    'rgb(201, 203, 0)',
    'rgb(255, 0, 132)',
    'rgb(255, 0, 64)',
    'rgb(255, 0, 86)', 
    'rgb(0, 192, 255)',

    'rgb(0, 22, 192)',
    'rgb(0, 99, 255)',
    'rgb(0, 200, 150)',
    'rgb(0, 200, 99)',
    'rgb(0, 200, 0)' 

  ];
  this.tsuffix = noMerge ? '(unmerged action names)' : "";
}

function mergeStats(json, keep, tomerge) {
  json.labels.forEach(function (label) {
    keep[label] += tomerge[label]
  })
  tomerge.discard = true;
  keep.discard = false;
  keep.merged = tomerge;
}

function merge_aliased_stats(json) {
  if (noMerge) return;
  json.data.forEach(function (e) {
    e.originalName = e.Name;
    e.mergedName = nameAlias(e.Name);
    e.Name = e.mergedName;
  })
  var name_date_map = {}
  json.data.forEach(function (e) {
    if (name_date_map[e.mergedName]) {
      if (name_date_map[e.mergedName][e.Date])
        mergeStats(json, name_date_map[e.mergedName][e.Date], e);
      else {
        name_date_map[e.mergedName][e.Date] = e
      }
    } else {
      name_date_map[e.mergedName] = {};
      name_date_map[e.mergedName][e.Date] = e
    }
  })
  json.data = json.data.filter(function (e) { return !e.discard }) 
  
}

function computeSortMap(json) { 
  var findAllMax = {};
  json.data.forEach(function (e) {
    var current = findAllMax["Name"];
    if (current == undefined) findAllMax["Name"]=e.Total; 
    if (findAllMax["Name"]<e.Total) findAllMax["Name"]=e.Total  
  }) 
  var s=[];
  json.action_names.forEach(function (name) {
    s.push ({ "Name": name, "Total": findAllMax[name]})
  })    

  s.sort(function (a, b) { if (a.Total > b.Total) return -1; else return 1; });
  var idx = 0;
  var sortMap = {}
  s.forEach(function (e) {
    e.sortIndex = idx++;
    sortMap[e.Name] = e.sortIndex
  }); 
  json.data.forEach(function (e) {
    e.sortIndex = sortMap[e.Name]
  })
  json.sortMap = sortMap;
}

function parse_csv(text) {
  var actionData = new ActionsData()
  // split into lines, trim blank lines
  var lines = text.split(/\r\n|\n/);
  lines = lines.filter(function (x) { return x.trim().length > 0 });
  var labels = lines[0].split(',');
  actionData.labels = labels.filter(function (e) { return e != 'Name' && e != 'Date' })
  for (var i = 1; i < lines.length; i++) {
    var data = lines[i].split(',');
    var r = {};
    for (var j = 0; j < labels.length; j++) {
      r[labels[j]] = convertKnownField(labels[j], data[j])
    }
    actionData.data.push(r)
  }
  merge_aliased_stats(actionData)
  compute_derived_stats(actionData)

  // unique action names
  var actionNames = new Set(actionData.data.map(function (e) { return e.Name }));
  actionData.action_names = [...actionNames];
  var action_dates = actionData.data.map(function (e) { return e.Date });
  actionData.action_dates = [...new Set(action_dates)];

  computeSortMap(actionData)
  
  var map = new Object();
  actionData.action_names.forEach(function (name) {
    map[name] = new Object();
  })
  actionData.data.forEach(function (element) {
    map[element.Name][element.Date] = element
  })
  actionData.map_name_date = map;
  return actionData;
}

function compute_derived_stats(actionData) {
  // actionData.data.forEach(function (d) {
  //   d['UniqueRepos/UniqueOwners'] = (d['UniqueRepos'] / d['UniqueOwners']).toFixed(2)
  //   d['WorkflowRuns/UniqueRepos'] = (d['WorkflowRuns'] / d['UniqueRepos']).toFixed(2)
  // })
  // actionData.labels.push('UniqueRepos/UniqueOwners')
  // actionData.labels.push('WorkflowRuns/UniqueRepos')
}

export {
  getTextAndUpdate, setInnerHtml, parse_csv
}