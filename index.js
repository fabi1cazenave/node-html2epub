#!/usr/bin/env node

'use strict';

function parseArgsSync() {
  var params = {};

  var argv = {};
  process.argv.forEach(function(arg) {
    var name = arg.replace(/^--|=.*$/g, '');
    var val = arg.replace(/^.*=/, '') || true;
    argv[name] = val;
  });

  if (argv.config) {
    var fs = require('fs');
    var path = require('path');
    params.outputFile = path.basename(argv.config, '.json') + '.epub';
    var config = JSON.parse(fs.readFileSync(argv.config));
    for (var k in config) {
      params[k] = config[k];
    }
  }

  for (var key in argv) {
    params[key] = argv[key];
  }

  return params;
}

var html2epub = require('./lib/');
var config = parseArgsSync();
var epub = new html2epub(config);

var remoteSpine = false;
var httpFilter = /^https?:\/\//;
epub.spine.forEach(function(href) {
  remoteSpine |= httpFilter.test(href);
});

if (remoteSpine) {
  epub.convert();
} else if (epub.format == 'epub') {
  epub.convertSync();
} else if (epub.format == 'opf') {
  console.log(epub.showOPF());
} else {
  console.log(epub.showToC());
}

