#!/usr/bin/env node

'use strict';

var util = require('./lib/util');
var config = util.parseArgsSync(process.argv.slice(2));

var html2epub = require('./lib/html2epub');
var epub = new html2epub(config);

var remoteSpine = false;
epub.spine.forEach(function(href) {
  remoteSpine |= util.httpFilter.test(href);
});

if (epub.format == 'epub') {
  epub.convert();
} else if (epub.format == 'opf') {
  console.log(epub.showOPF());
} else {
  console.log(epub.showToC());
}

