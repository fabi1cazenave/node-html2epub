#!/usr/bin/env node

'use strict';

var fs      = require('fs');
var url     = require('url');
var http    = require('http');
var mime    = require('mime');
var cheerio = require('cheerio');


/**
 * wget
 *
 * Simple, native and naive implementation. Expect bugs.
 * The main feature is that it can embed all external medias as data-URLs
 * -- hence, fetching a web page results in a single HTML file.
 */

function download(href, encoding, onsuccess, onerror) {
  onsuccess = (typeof onsuccess == 'function') ? onsuccess : function() {};
  onerror   = (typeof onerror   == 'function') ? onerror   : function() {};

  http.get(href, function(res) {
    var data = '';
    if (encoding) {
      res.setEncoding(encoding);
      if (encoding == 'base64') {
        data = 'data:' + mime.lookup(href) + ';base64,';
      }
    }
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() { onsuccess(data); });
  }).on('error', function() { onerror(); });
}

var urlTrim = /^url\(['"]?|['"]?\)$/g;
var urlDetect = /url\(['"]?[^'"\)]*['"]?\)/g;
var urlPattern = /url\((['"]?)([^'"\)]*)(['"]?)\)/g; // unused

function inlineStylesheets(doc, baseHref, callback) {
  var extStylesheets = doc('link[rel=stylesheet]');
  var sheetsToFetch = extStylesheets.length;
  if (!sheetsToFetch) {
    callback(doc);
    return;
  }

  extStylesheets.each(function(index, element) {
    var href = url.resolve(baseHref, doc(element).attr('href'));
    download(href, '', function(css) {
      // XXX handle @import rules recursively
      css = css.replace(urlDetect, function(match, offset, str) {
        var href = url.resolve(baseHref, match.replace(urlTrim, ''));
        return 'url("' + href + '")';
      });
      // XXX preserve element attributes
      doc(element).replaceWith('<style type="text/css">\n' + css + ' </style>');
      if (--sheetsToFetch <= 0) {
        callback(doc);
      }
    });
    console.log(href);
  });
}

function inlineScripts(doc, baseHref, callback) {
  var extScripts = doc('script[src]');
  var scriptsToFetch = extScripts.length;
  if (!scriptsToFetch) {
    callback(doc);
    return;
  }

  extScripts.each(function(index, element) {
    var src = url.resolve(baseHref, doc(element).attr('src'));
    download(src, '', function(js) {
      doc(element).attr('src', null);
      doc(element).text(js);
      if (--scriptsToFetch <= 0) {
        callback(doc);
      }
    });
    console.log(src);
  });
}

function getMediaURLs(doc, baseHref, callback) {
  var URLs = [];
  function pushURL(href) {
    href = url.resolve(baseHref, href);
    if (URLs.indexOf(href) < 0) {
      URLs.push(href);
      console.log(href);
    }
  }

  doc('style').each(function(index, element) {
    (doc(element).text().match(urlDetect) || []).forEach(function(match) {
      pushURL(match.replace(urlTrim, ''));
    });
  });

  doc('img, audio, video').each(function(index, element) {
    pushURL(doc(element).attr('src'));
  });

  var dataURLs = {};
  var elementsToFetch = URLs.length;
  if (!elementsToFetch) {
    callback(dataURLs);
  } else {
    URLs.forEach(function(src) {
      download(src, 'base64', function(data) {
        dataURLs[src] = data;
        if (--elementsToFetch <= 0) {
          callback(dataURLs);
        }
      });
    });
  }
  return URLs;
}

function useDataURLs(doc, baseHref, dataURLs) {
  doc('style').each(function(index, element) {
    var css = doc(element).text();
    css = css.replace(urlDetect, function(match, offset, str) {
      var href = url.resolve(baseHref, match.replace(urlTrim, ''));
      if (!(href in dataURLs) || !dataURLs[href]) {
        console.error('missing data-URL: ' + href);
      }
      return 'url(' + dataURLs[href] + ')';
    });
    doc(element).text(css);
  });

  doc('img, audio, video').each(function(index, element) {
    var src = url.resolve(baseHref, doc(element).attr('src'));
    if (!(src in dataURLs) || !dataURLs[src]) {
      console.error('missing data-URL: ' + src);
    }
    doc(element).attr('src', dataURLs[src]);
  });
}

function wget(inputURL, outputFile) {
  download(inputURL, '', function(data) {
    var $ = cheerio.load(data);

    var baseHref = inputURL.replace(/[^\/]*$/, '');
    if ($('base').length) {
      // XXX does not work if <base> has a relative URL
      baseHref = $('base').last().attr('href');
    } else {
      $('head').prepend('\n  <base href="' + baseHref + '" />');
    }

    inlineStylesheets($, baseHref, function(doc) {
      inlineScripts($, baseHref, function(doc) {
        getMediaURLs($, baseHref, function(dataURLs) {
          useDataURLs($, baseHref, dataURLs);
          console.log('==> ' + outputFile);
          fs.writeFileSync(outputFile, $.html());
        });
      });
    });
  }, function(error) {
    console.error('Something went wrong. Now guess what.');
  });
}


/**
 * main
 */

if (process.argv.length < 3) {
  console.error('usage: ./wget.js URL');
  throw 'missing URI argument';
}
wget(process.argv[2], 'output.html');

