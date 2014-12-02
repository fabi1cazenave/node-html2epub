// 'use strict';

// built-in
var fs       = require('fs');
var url      = require('url');
var http     = require('http');
var https    = require('https');
var path     = require('path');
// third-part
var mime     = require('mime');
var cheerio  = require('cheerio');
var archiver = require('archiver');

var util = module.exports = {};

util.httpFilter = /^https?:\/\//;
util.htmlFilter = /\.x?html?$/;

util.newUUID = function newUUID() {
  // http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript/2117523#2117523
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};


/**
 * Command-Line Argument Parser
 */

function _expandSpine(spine) {
  var hrefs = [];

  function push(href) {
    if (hrefs.indexOf(href) < 0) {
      hrefs.push(href);
    }
  }

  (spine || []).forEach(function(href) {
    if (util.httpFilter.test(href)) {
      push(href);
    } else if (fs.existsSync(href)) {
      if (fs.lstatSync(href).isDirectory()) {
        util.findFilesSync(href, util.htmlFilter).forEach(function(file) {
          push(file);
        });
      } else {
        push(href);
      }
    } else {
      console.error('not supported or non-existing source: ' + href);
    }
  });

  return hrefs;
}

util.parseArgsSync = function parseArgsSync(args) {
  var params = {};

  // parse commande-line arguments
  var argv = {};
  var dc = {};
  var spine = [];
  (args || []).forEach(function(arg) {
    if (/^--/.test(arg)) {
      var name = arg.replace(/^--|=.*$/g, '');
      var val = arg.replace(/^.*=/, '') || true;
      if (name === 'dc' || name === 'spine') {
        console.error('"' + name + '" is not a valid argument');
      } else if (/^dc:/.test(name)) {
        dc[name.replace(/^dc:/, '')] = val;
      } else {
        argv[name] = val;
      }
    } else {
      spine.push(arg);
    }
  });

  // load configuration file, if any
  if (argv.config) {
    params.outputFile = path.basename(argv.config, '.json') + '.epub';
    var config = JSON.parse(fs.readFileSync(argv.config));
    for (var k in config) {
      params[k] = config[k];
    }
  }

  // command-line arguments can override the configuration file
  for (var key in argv) {
    params[key] = argv[key];
  }
  for (key in dc) {
    if (!(dc in params)) {
      params.dc = {};
    }
    params.dc[key] = dc[key];
  }
  if (spine.length) {
    params.spine = _expandSpine(spine);
  }

  return params;
};


/**
 * File Utilities
 */

util.findFilesSync = function findFilesSync(basedir, filter) {
  var files = [];

  function treeWalkSync(base, dir) {
    dir = path.resolve(base, dir);
    (fs.readdirSync(dir) || []).forEach(function(entry) {
      if (fs.lstatSync(path.resolve(dir, entry)).isDirectory()) {
        treeWalkSync(dir, entry);
      } else if (!filter || filter.test(entry)) {
        files.push(path.relative(basedir, path.resolve(dir, entry)));
      }
    });
  }

  treeWalkSync(basedir, '.');
  return files;
};

util.getNonExistingFileSync = function getNonExistingFileSync(filename) {
  if (fs.existsSync(filename)) {
    var ext = 1;
    while (fs.existsSync(filename + '.' + ext)) {
      ext++;
    }
    return filename + '.' + ext;
  } else {
    return filename;
  }
};

util.epubArchive = function epubArchive(outputfile, rootfile, callback) {
  var output = fs.createWriteStream(outputfile);
  var archive = archiver('zip');

  output.on('close', function () {
    console.log(outputfile + ' - ' + archive.pointer() + ' bytes');
    if (typeof callback === 'function') {
      callback();
    }
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);

  // to pass the IDPF validator, the mimetype must be the first file in the zip
  // archive and it must be uncompressed -- otherwise, expect this message:
  //   "Mimetype contains wrong type (application/epub+zip expected)."
  archive.append('application/epub+zip', { name: 'mimetype', store: true });

  // META-INF container
  var container = '<?xml version="1.0"?>' +
    '\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '\n   <rootfiles>' +
    '\n     <rootfile full-path="' + rootfile + '" media-type="application/oebps-package+xml"/>' +
    '\n   </rootfiles>' +
    '\n</container>';
  archive.append(container, { name: 'META-INF/container.xml' });

  return archive;
};


/**
 * Table of Contents
 */

util.getHeadingID = function getHeadingID(elt) {
  var id = '';

  // find a suitable ID for `elt`: if there's no leading text between the
  // current element and the beginning of its parent, the parent ID can be used
  var txt = '';
  while (elt.length && !txt.length) {
    id = elt.attr('id');
    if (id) {
      break;
    }
    var p = elt.prev();
    while (p.length) {
      txt += p.text();
      p = p.prev();
    }
    elt = elt.parent();
  }

  return id;
};

function _indent(level) {
  var txt = '\n    ';
  for (var i = 0; i < level; i++) {
    txt += '  ';
  }
  return txt;
}

util.buildToC_txt = function buildToC_txt(pages, depth) {
  var txt = '';

  pages.forEach(function(page) {
    page.headings.forEach(function(heading) {
      if (heading.level < depth) {
        txt += _indent(heading.level) + heading.title;
      }
    });
  });

  return txt + '\n';
};

util.buildToC_ncx = function buildToC_ncx(pages, depth) { // EPUB2
  var $ = cheerio.load('<navMap></navMap>', {
    xmlMode: true,
    decodeEntities: false
  });
  var nav = [$('navMap')];
  var currentLevel = 0;
  var playOrder = 1;

  pages.forEach(function(page) {
    page.headings.forEach(function(heading) {
      if (heading.level < depth) {
        var point = _indent(heading.level) +
          '<navPoint id="nav_' + playOrder + '" playOrder="' + playOrder + '">' +
          '<navLabel><text>' + heading.title + '</text></navLabel>' +
          '<content src="' + heading.href + '" />' +
          '</navPoint>';

        if (heading.level <= currentLevel) { // re-use current or parent <navPoint>
          nav[heading.level].append(point);
        } else {                             // create new <navPoint> child
          nav[heading.level] = nav[currentLevel].find('navPoint').last();
          nav[currentLevel].find('navPoint').last().append(point);
        }

        currentLevel = heading.level;
        playOrder++;
      }
    });
  });

  return $.html();
};

util.buildToC_xhtml = function buildToC_xhtml(pages, depth) { // EPUB3
  var $ = cheerio.load('  <nav epub:type="toc"><ol></ol>\n  </nav>', {
    xmlMode: true,
    decodeEntities: false
  });
  var ol = [$('ol')];
  var currentLevel = 0;

  pages.forEach(function(page) {
    page.headings.forEach(function(heading) {
      if (heading.level < depth) {
        var title = heading.href ?
          '<a href="' + heading.href + '">' + heading.title + '</a>' :
          '<span>' + heading.title + '</span>';
        var li = _indent(heading.level) + '<li>' + title + '</li>';

        if (heading.level <= currentLevel) { // re-use current or parent <ol>
          ol[heading.level].append(li);
        } else {                             // create new <ol> child
          ol[currentLevel].find('li').last().append('<ol>' + li + '</ol>');
          ol[heading.level] = ol[currentLevel].find('ol').last();
        }

        currentLevel = heading.level;
      }
    });
  });

  return $.html();
};

util.buildToC_json = function buildToC_json(pages, depth, strict) {
  var toc = { children: [] };
  var current = toc;
  var currentLevel = 0;

  pages.forEach(function(page) {
    page.headings.forEach(function(heading) {
      if (heading.level < depth) {
        var t = {
          title: heading.title,
          href: heading.href
        };

        // select the appropriate tree branch if the heading level changes
        if (heading.level < currentLevel) { // retrieve existing parent branch
          current = toc;
          for (var i = 0; i < heading.level; i++) {
            current = current.children[current.children.length - 1];
          }
        } else if (heading.level == currentLevel + 1) { // create a new branch
          current = current.children[current.children.length - 1];
          current.children = [];
        } else if (heading.level > currentLevel + 1) { // create nested branches
          console.error('non-continous heading (h' + (heading.level + 1) + '): ' + heading.title);
          if (strict) {
            t = null; // skip this heading
          } else {
            for (var j = 0; j < (heading.level - currentLevel); j++) {
              if (!current.children.length) {
                current.children.push({});
              }
              current = current.children[current.children.length - 1];
              current.children = [];
            }
          }
        }

        // add heading to ToC tree
        if (t) {
          currentLevel = heading.level;
          current.children.push(t);
        }
      }
    });
  });

  return toc.children;
};


/**
 * EPUB Index
 */

function _zeroPadding(prefix, number, digits) {
  number++;
  var str = number.toString();
  while (str.length < digits) {
    str = '0' + str;
  }
  return prefix + str;
}

util.buildOPF = function buildOPF(files, spine) {
  var items = [];
  var ncx = 0;

  var digits = files.length.toString().length;
  files.forEach(function(href, index) {
    var id = '';
    var type = mime.lookup(href);

    if (spine.indexOf(href) >= 0) {
      id = _zeroPadding('page_', spine.indexOf(href), digits);
    } else if (type == 'application/x-dtbncx+xml') { // toc.ncx
      id = 'ncx';
      ncx++;
    } else if (type != 'application/oebps-package+xml') { // not content.opf
      id = _zeroPadding('res_', index, digits);
    }

    if (id) {
      items.push('<item' +
        ' id="' + id + '"' +
        ' media-type="' + type + '"' +
        ' href="' + href + '"' +
        (href == 'toc.xhtml' ? ' properties="nav"' : '') +
        ' />');
    }
  });

  if (ncx > 1) {
    console.error('several NCX files have been found.');
  }

  var manifest = '\n  <manifest>' +
    '\n    ' + items.sort().join('\n    ') +
    '\n  </manifest>';

  var itemrefs = '\n  <spine' + (ncx == 1 ? ' toc="ncx"' : '') + '>';
  spine.forEach(function(href, index) {
    var idref = _zeroPadding('page_', index, digits);
    itemrefs += '\n    <itemref idref="' + idref + '" />';
  });
  itemrefs += '\n  </spine>';

  return {
    manifest: manifest,
    itemrefs: itemrefs
  };
};


/**
 * Load a local or remote file
 */

util.download = function download(href, encoding, onsuccess, onerror) {
  onsuccess = (typeof onsuccess == 'function') ? onsuccess : function() {};
  onerror   = (typeof onerror   == 'function') ? onerror   : function() {};

  var protocol = url.parse(href).protocol;
  var get = function() {
    console.error(protocol + ' is not supported');
  };

  switch (protocol) {
    case 'http:':
      get = http.get;
      break;
    case 'https:':
      get = https.get;
      break;
  }

  get(href, function(res) {
    var data = '';
    if (encoding) {
      res.setEncoding(encoding);
      if (encoding == 'base64') {
        data = 'data:' + mime.lookup(href) + ';base64,';
      }
    }
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() { onsuccess(data); });
  }).on('error', function(err) { onerror(err); });
};

