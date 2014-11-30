#!/usr/bin/env node

'use strict';

// built-in
var fs       = require('fs');
var url      = require('url');
var http     = require('http');
var path     = require('path');
// third-part
var mime     = require('mime');
var cheerio  = require('cheerio');
var archiver = require('archiver');

var httpFilter = /^https?:\/\//;
var htmlFilter = /\.x?html?$/;

function parseArgsSync() {
  var params = {
    basedir: process.cwd(),
    identifier: getUUID(),
    charset: 'UTF-8',
    language: 'en',
    format: 'epub',        // ToC output format (XXX misleading name)
    depth: 3,              // ToC depth
    keepAllHeadings: false // ignore headings that have no usable ID/anchor
  };

  var argv = {};
  process.argv.forEach(function(arg) {
    var name = arg.replace(/^--|=.*$/g, '');
    var val = arg.replace(/^.*=/, '') || true;
    argv[name] = val;
  });

  if (argv.config) {
    params.outputFile = path.basename(argv.config, '.json') + '.epub';
    var config = JSON.parse(fs.readFileSync(argv.config));
    for (var k in config) {
      params[k] = config[k];
    }
  }

  for (var key in argv) {
    params[key] = argv[key];
  }

  params.outputFile = getNonExistingFileSync(params.outputFile ||
    path.basename(params.basedir) + '.epub');

  // XXX this section should not exist (makeEPUB should be async)
  if (!params.spine || !params.spine.length) {
    params.remoteSpine = false;
    params.spine = findFilesSync(params.basedir, htmlFilter);
  } else { // spine is pre-defined
    params.remoteSpine = true;
    params.spine.forEach(function(href) {
      params.remoteSpine &= httpFilter.test(href);
    });
  }

  return params;
}

function getNonExistingFileSync(filename) {
  if (fs.existsSync(filename)) {
    var ext = 1;
    while (fs.existsSync(filename + '.' + ext)) {
      ext++;
    }
    return filename + '.' + ext;
  } else {
    return filename;
  }
}

function findFilesSync(basedir, filter) {
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
}

function getUUID() {
  // http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript/2117523#2117523
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}


/**
 * Table of Contents
 *
 * This script generates a table of contents from the headers in a collection
 * of XHTML documents.  Four output formats are supported:
 *  - txt   : quick-and-dirty extraction (default output)
 *  - json  : sharp logical structure
 *  - xhtml : EPUB3 index -- elegant and human-readable
 *  - ncx   : EPUB2 index -- ugly but ensures compatibility
 */

function getHeadingID(elt) {
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
}

function getHeadings(doc, href, headingSelector, keepAllHeadings) {
  var headings = [];

  headingSelector = headingSelector || 'h1,h2,h3,h4,h5,h6';
  var firstLevel = headingSelector.charAt(1); // XXX ugliest hack *EVER*
  doc(headingSelector).each(function(index, element) {
    var elt = doc(element);
    var h = {
      level: parseInt(element.tagName.substr(1), 10) - firstLevel,
      title: elt.text().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ')
    };

    var id = getHeadingID(elt);
    if (id) {
      h.href = href + '#' + id;
    } else if (!index) { // if the first title has no ID, use the page href
      h.href = href;
    }

    if (h.href || keepAllHeadings) {
      headings.push(h);
    }
  });

  return headings;
}

function parseHeadingsSync(config) {
  var pages = [];

  config.spine.forEach(function(href, i) {
    var xhtml = fs.readFileSync(path.resolve(config.basedir, href));
    var $ = cheerio.load(xhtml, { decodeEntities: false });
    pages.push({
      href: href,
      headings: getHeadings($, href, config.headings, config.keepAllHeadings)
    });
  });

  return pages;
}

function indent(level) {
  var txt = '\n    ';
  for (var i = 0; i < level; i++) {
    txt += '  ';
  }
  return txt;
}

function buildToC_txt(pages, depth) {
  var txt = '';

  pages.forEach(function(page) {
    page.headings.forEach(function(heading) {
      if (heading.level < depth) {
        txt += indent(heading.level) + heading.title;
      }
    });
  });

  return txt + '\n';
}

function buildToC_json(pages, depth, strict) {
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
}

function buildToC_ncx(pages, depth) { // EPUB2
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
        var point = indent(heading.level) +
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
}

function buildToC_xhtml(pages, depth) { // EPUB3
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
        var li = indent(heading.level) + '<li>' + title + '</li>';

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
}

function buildToC(config, pages, format) {
  var output = '';

  switch (format || config.format) {
    case 'txt':
      output = buildToC_txt(pages, config.depth);
      break;

    case 'json':
      var toc = buildToC_json(pages, config.depth, config.strict);
      output = JSON.stringify(toc, null, 2);
      break;

    case 'ncx':
      output = '<?xml version="1.0" encoding="' + config.charset + '"?>' +
        '\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
        '\n  <head>' +
        '\n    <meta name="dtb:uid" content="' + config.identifier + '" />' +
        '\n    <meta name="dtb:depth" content="' + config.depth + '" />' +
        '\n  </head>' +
        '\n  <docTitle>' +
        '\n    <text>' + config.title + '</text>' +
        '\n  </docTitle>' +
        '\n  ' + buildToC_ncx(pages, config.depth) +
        '\n</ncx>';
      break;

    case 'xhtml':
      output = '<?xml version="1.0" encoding="' + config.charset + '"?>' +
        '\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
        '\n<head>' +
        '\n  <meta charset="' + config.charset + '" />' +
        '\n  <title>' + config.title + '</title>' +
        '\n  <style type="text/css"> nav ol { list-style-type: none; } </style>' +
        '\n</head>' +
        '\n<body>' +
        '\n' + buildToC_xhtml(pages, config.depth) +
        '\n</body>' +
        '\n</html>';
      break;

    default:
      console.error('unsupported output format: "' + config.format + '"');
  }

  return output;
}


/**
 * EPUB maker (local)
 *
 * Wrap a collection of local HTML documents and their associated resources
 * (see "[[content]" below) in an EPUB archive:
 *
 *   META-INF
 *     container.xml
 *   EPUB
 *     content.opf
 *     toc.ncx
 *     toc.xhtml
 *     [[content]]
 *   mimetype
 *
 * This structure can't be modified (yet). The good thing is, it works in all
 * EPUB readers.
 *
 * The `mimetype` and `META-INF/container.xml` files are always auto-generated.
 * The `content.opf`, `toc.ncx` and `toc.xhtml` files are generated if necessary
 * (= they aren't overwritten if they already exist in the base directory).
 */

function zeroPadding(prefix, number, digits) {
  number++;
  var str = number.toString();
  while (str.length < digits) {
    str = '0' + str;
  }
  return prefix + str;
}

function buildOPF_manifest(files, spine) {
  var items = [];
  var ncx = 0;

  var digits = files.length.toString().length;
  files.forEach(function(href, index) {
    var id = '';
    var type = mime.lookup(href);

    if (spine.indexOf(href) >= 0) {
      id = zeroPadding('page_', spine.indexOf(href), digits);
    } else if (type == 'application/x-dtbncx+xml') { // toc.ncx
      id = 'ncx';
      ncx++;
    } else if (type != 'application/oebps-package+xml') { // not content.opf
      id = zeroPadding('res_', index, digits);
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
    var idref = zeroPadding('page_', index, digits);
    itemrefs += '\n    <itemref idref="' + idref + '" />';
  });
  itemrefs += '\n  </spine>';

  return manifest + itemrefs;
}

function buildOPF(config, files) {
  var dc = '';
  for (var key in config.dc) {
    dc += '\n    <dc:' + key + '>' + config.dc[key] + '</dc:' + key + '>';
  }

  var opf = '<?xml version="1.0" encoding="' + config.charset + '"?>' +
    '\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">' +
    '\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '\n    <dc:identifier id="uuid">' + config.identifier + '</dc:identifier>' +
    '\n    <dc:title>' + config.title + '</dc:title>' +
    '\n    <dc:language>' + config.language + '</dc:language>' + dc +
    '\n  </metadata>' +
    buildOPF_manifest(files, config.spine) +
    '\n</package>';

  return opf;
}

function epubArchive(outputfile, rootfile) {
  var output = fs.createWriteStream(outputfile);
  var archive = archiver('zip');

  output.on('close', function () {
    console.log(outputfile + ' - ' + archive.pointer() + ' bytes');
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);

  // the mimetype must be the first file in the zip archive
  archive.append('application/epub+zip', { name: 'mimetype' });

  // META-INF container
  var container = '<?xml version="1.0"?>' +
    '\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '\n   <rootfiles>' +
    '\n     <rootfile full-path="' + rootfile + '" media-type="application/oebps-package+xml"/>' +
    '\n   </rootfiles>' +
    '\n</container>';
  archive.append(container, { name: 'META-INF/container.xml' });

  return archive;
}

function makeEPUB_local(config) {
  var rootfile = 'EPUB/content.opf';
  var tocEPUB3 = 'EPUB/toc.xhtml';
  var tocEPUB2 = 'EPUB/toc.ncx';

  function fileExists(filename) {
    return fs.existsSync(path.resolve(config.basedir, filename));
  }

  // create an EPUB archive
  var archive = epubArchive(config.outputFile, rootfile);

  // append EPUB indexes
  var pages = parseHeadingsSync(config);
  var files = findFilesSync(config.basedir);
  if (!fileExists('toc.xhtml')) {
    files.push('toc.xhtml');
    archive.append(buildToC(config, pages, 'xhtml'), { name: 'EPUB/toc.xhtml' });
  }
  if (!fileExists('toc.ncx')) {
    files.push('toc.ncx');
    archive.append(buildToC(config, pages, 'ncx'), { name: 'EPUB/toc.ncx' });
  }
  if (!fileExists('content.opf')) {
    archive.append(buildOPF(config, files), { name: 'EPUB/content.opf' });
  }

  // append EPUB content
  archive.bulk([
    { expand: true, cwd: config.basedir, src: [ '**' ], dest: 'EPUB' }
  ]);

  archive.finalize();
}


/**
 * EPUB maker (remote)
 *
 * Wrap a collection of remote HTML documents and their associated resources
 * (see "[[content]" below) in an EPUB archive:
 *
 *   META-INF
 *     container.xml
 *   EPUB
 *     [www.website.tld]
 *       [[content]]
 *     content.opf
 *     toc.ncx
 *     toc.xhtml
 *   mimetype
 *
 * This structure can't be modified. All files, except the [[content]] part,
 * are auto-generated.
 */

var urlTrim = /^url\(['"]?|['"]?\)$/g;
var urlDetect = /url\(['"]?[^'"\)]*['"]?\)/g;
var urlPattern = /url\((['"]?)([^'"\)]*)(['"]?)\)/g; // unused

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

function makeEPUB_remote(config) {
  var rootfile = 'EPUB/content.opf';
  var archive = epubArchive(config.outputFile, rootfile);

  var pages = new Array(config.spine.length);
  var pagesToFetch = config.spine.length;

  var resourceURLs = [];
  var resourcesToFetch = resourceURLs.length;

  function appendIndex() {
    resourceURLs.forEach(function(element, index, array) {
      array[index] = element.replace(httpFilter, '');
    });
    config.spine.forEach(function(element, index, array) {
      array[index] = element.replace(httpFilter, '');
      resourceURLs.push(element.replace(httpFilter, ''));
    });
    resourceURLs.push('toc.xhtml');
    resourceURLs.push('toc.ncx');
    archive.append(buildOPF(config, resourceURLs  ), { name: 'EPUB/content.opf' });
    archive.append(buildToC(config, pages, 'xhtml'), { name: 'EPUB/toc.xhtml'   });
    archive.append(buildToC(config, pages, 'ncx'  ), { name: 'EPUB/toc.ncx'     });
  }

  function appendContent(data, href) {
    archive.append(data, { name: 'EPUB/' + href.replace(httpFilter, '') });
    if (!pagesToFetch && !resourcesToFetch) {
      appendIndex();
      archive.finalize();
    }
  }

  config.spine.forEach(function(inputURL, page_index) {
    download(inputURL, '', function(data) {
      console.log('  downloading: ' + inputURL);
      var $ = cheerio.load(data);

      var baseHref = inputURL.replace(/[^\/]*$/, '');
      if ($('base').length) {
        // XXX does not work if <base> has a relative URL
        baseHref = $('base').last().attr('href');
      } else {
        $('head').prepend('\n  <base href="' + baseHref + '" />');
      }

      function pushResourceURL(href) {
        href = url.resolve(baseHref, href);
        if (resourceURLs.indexOf(href) < 0) {
          resourceURLs.push(href);
          resourcesToFetch++;
          download(href, 'binary', function(data) {
            appendContent(data, href, --resourcesToFetch);
          });
          console.log('  downloading: ' + href);
        }
      }

      $('style').each(function(index, element) {
        ($(element).text().match(urlDetect) || []).forEach(function(match) {
          pushResourceURL(match.replace(urlTrim, ''));
        });
      });

      $('img, audio, video').each(function(index, element) {
        pushResourceURL($(element).attr('src'));
      });

      $('link[rel=stylesheet]').each(function(index, element) {
        // TODO: fetch the media in the external stylesheet
        pushResourceURL($(element).attr('href'));
      });

      var href = inputURL.replace(httpFilter, '');
      pages[page_index] = {
        href: href,
        headings: getHeadings($, href, config.headings, config.keepAllHeadings)
      };

      appendContent(data, inputURL, --pagesToFetch);
    }, function(error) {
      console.error('Something went wrong. Now guess what.');
    });
  });
}


/**
 * main
 */

var config = parseArgsSync();
if (config.remoteSpine) {
  makeEPUB_remote(config);
} else if (config.format == 'epub') {
  makeEPUB_local(config);
} else if (config.format == 'opf') {
  console.log(buildOPF(config));
} else {
  console.log(buildToC(config, parseHeadingsSync(config)));
}

