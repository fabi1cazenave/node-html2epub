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


/**
 * Constructor
 */

var httpFilter = /^https?:\/\//;
var htmlFilter = /\.x?html?$/;

function getUUID() {
  // http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript/2117523#2117523
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
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

var html2epub = module.exports = function html2epub(options) {
  options = options || {};
  if (!(this instanceof html2epub)) {
    return new html2epub(options);
  }

  // metadata (TODO: extract title/charset/language from HTML metadata)
  this.identifier = options.identifier || getUUID();
  this.title      = options.title      || 'Untitled';
  this.charset    = options.charset    || 'UTF-8';
  this.language   = options.language   || 'en';
  this.dc         = options.dc         || {};
  this.modified   = options.modified   ||
    (new Date()).toISOString().replace(/\.[0-9]{3}Z$/, 'Z');

  // Table of Contents (XXX `format` is a very misleading name)
  this.format   = options.format   || 'epub'; // ToC output format
  this.depth    = options.depth    || 3;      // ToC depth
  this.headings = options.headings || 'h1,h2,h3,h4,h5,h6'; // title selector
  this.keepAllHeadings = !!options.keepAllHeadings; // ignore headings that have no usable ID/anchor

  // list of HTML files to convert to EPUB
  this.basedir = options.basedir || process.cwd();
  this.spine   = options.spine   || findFilesSync(this.basedir, htmlFilter);

  // output file
  this.outputFile = getNonExistingFileSync(options.outputFile ||
    path.basename(this.basedir) + '.epub');
};


/**
 * Headings
 * .getHeadings(document, href)
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

html2epub.prototype.getHeadings = function getHeadings(doc, href) {
  var headings = [];
  var keepAllHeadings = this.keepAllHeadings;

  var firstLevel = this.headings.charAt(1); // XXX ugliest hack *EVER*
  doc(this.headings).each(function(index, element) {
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
};

html2epub.prototype.parseHeadingsSync = function parseHeadingsSync() {
  var pages = [];

  var self = this;
  this.spine.forEach(function(href, i) {
    var xhtml = fs.readFileSync(path.resolve(self.basedir, href));
    var $ = cheerio.load(xhtml, { decodeEntities: false });
    pages.push({
      href: href,
      headings: self.getHeadings($, href)
    });
  });

  return pages;
};


/**
 * Table of Contents:
 * .showToC(pages, format)
 *
 * This generates a table of contents from the headers in a collection of XHTML
 * documents.  Four output formats are supported:
 *  - txt   : quick-and-dirty extraction (default output)
 *  - json  : sharp logical structure
 *  - xhtml : EPUB3 index -- elegant and human-readable
 *  - ncx   : EPUB2 index -- ugly but ensures compatibility
 */

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

html2epub.prototype.showToC = function showToC(pages, format) {
  var output = '';
  pages = pages || this.parseHeadingsSync();
  format = format || this.format;

  switch (format) {
    case 'txt':
      output = buildToC_txt(pages, this.depth);
      break;

    case 'json':
      var toc = buildToC_json(pages, this.depth, this.strict);
      output = JSON.stringify(toc, null, 2);
      break;

    case 'ncx':
      output = '<?xml version="1.0" encoding="' + this.charset + '"?>' +
        '\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
        '\n  <head>' +
        '\n    <meta name="dtb:uid" content="' + this.identifier + '" />' +
        '\n    <meta name="dtb:depth" content="' + this.depth + '" />' +
        '\n  </head>' +
        '\n  <docTitle>' +
        '\n    <text>' + this.title + '</text>' +
        '\n  </docTitle>' +
        '\n  ' + buildToC_ncx(pages, this.depth) +
        '\n</ncx>';
      break;

    case 'xhtml':
      output = '<?xml version="1.0" encoding="' + this.charset + '"?>' +
        '\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
        '\n<head>' +
        '\n  <meta charset="' + this.charset + '" />' +
        '\n  <title>' + this.title + '</title>' +
        '\n  <style type="text/css"> nav ol { list-style-type: none; } </style>' +
        '\n</head>' +
        '\n<body>' +
        '\n' + buildToC_xhtml(pages, this.depth) +
        '\n</body>' +
        '\n</html>';
      break;

    default:
      console.error('unsupported output format: "' + format + '"');
  }

  return output;
};


/**
 * .showOPF(files)
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

html2epub.prototype.showOPF = function showOPF(files) {

if (!files)
{
    var basedir = this.basedir;

    // append EPUB indexes
    var files = findFilesSync(basedir);
  }

  var dc = '';
  for (var key in this.dc) {
    dc += '\n    <dc:' + key + '>' + this.dc[key] + '</dc:' + key + '>';
  }

  var opf = '<?xml version="1.0" encoding="' + this.charset + '"?>' +
    '\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">' +
    '\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '\n    <dc:identifier id="uuid">' + this.identifier + '</dc:identifier>' +
    '\n    <dc:title>' + this.title + '</dc:title>' +
    '\n    <dc:language>' + this.language + '</dc:language>' + dc +
    '\n    <meta property="dcterms:modified">' + this.modified + '</meta>' +
    '\n  </metadata>' +
    buildOPF_manifest(files, this.spine) +
    '\n</package>';

  return opf;
};


/**
 * .convertSync()
 *
 * Wrap a collection of local HTML documents and their associated resources
 * (see "[[content]" below) in an EPUB archive:
 *
 *   EPUB
 *     content.opf
 *     toc.ncx
 *     toc.xhtml
 *     [[content]]
 *   META-INF
 *     container.xml
 *   mimetype
 *
 * This structure can't be modified (yet). The good thing is, it works in all
 * EPUB readers.
 *
 * The `mimetype` and `META-INF/container.xml` files are always auto-generated.
 * The `content.opf`, `toc.ncx` and `toc.xhtml` files are generated if necessary
 * (= they aren't overwritten if they already exist in the base directory).
 */

function epubArchive(outputfile, rootfile, callback) {
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
}

html2epub.prototype.convertSync = function convertSync() {
  var rootfile = 'EPUB/content.opf';
  var tocEPUB3 = 'EPUB/toc.xhtml';
  var tocEPUB2 = 'EPUB/toc.ncx';

  var basedir = this.basedir;
  function fileExists(filename) {
    return fs.existsSync(path.resolve(basedir, filename));
  }

  // create an EPUB archive
  var archive = epubArchive(this.outputFile, rootfile);

  // append EPUB indexes
  var files = findFilesSync(basedir);
  var pages = this.parseHeadingsSync();
  if (!fileExists('toc.xhtml')) {
    files.push('toc.xhtml');
    archive.append(this.showToC(pages, 'xhtml'), { name: 'EPUB/toc.xhtml' });
  }
  if (!fileExists('toc.ncx')) {
    files.push('toc.ncx');
    archive.append(this.showToC(pages, 'ncx'), { name: 'EPUB/toc.ncx' });
  }
  if (!fileExists('content.opf')) {
    archive.append(this.showOPF(files), { name: 'EPUB/content.opf' });
  }

  // append EPUB content
  archive.bulk([
    { expand: true, cwd: basedir, src: [ '**' ], dest: 'EPUB' }
  ]);

  archive.finalize();
};


/**
 * .convert(callback)
 *
 * Wrap a collection of remote HTML documents and their associated resources
 * (see "[[content]" below) in an EPUB archive:
 *
 *   EPUB
 *     [www.website.tld]
 *       [[content]]
 *     content.opf
 *     toc.ncx
 *     toc.xhtml
 *   META-INF
 *     container.xml
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
}

html2epub.prototype.convert = function convert(callback) {
  var self = this;

  var rootfile = 'EPUB/content.opf';
  var archive = epubArchive(this.outputFile, rootfile, callback);

  var pages = new Array(this.spine.length);
  var pagesToFetch = this.spine.length;

  var resourceURLs = [];
  var resourcesToFetch = resourceURLs.length;

  function appendIndex() {
    resourceURLs.forEach(function(element, index, array) {
      array[index] = element.replace(httpFilter, '');
    });
    self.spine.forEach(function(element, index, array) {
      array[index] = element.replace(httpFilter, '');
      resourceURLs.push(element.replace(httpFilter, ''));
    });
    resourceURLs.push('toc.xhtml');
    resourceURLs.push('toc.ncx');
    archive.append(self.showOPF(resourceURLs  ), { name: 'EPUB/content.opf' });
    archive.append(self.showToC(pages, 'xhtml'), { name: 'EPUB/toc.xhtml'   });
    archive.append(self.showToC(pages, 'ncx'  ), { name: 'EPUB/toc.ncx'     });
  }

  function appendContent(data, href) {
    archive.append(data, { name: 'EPUB/' + href.replace(httpFilter, '') });
    if (!pagesToFetch && !resourcesToFetch) {
      appendIndex();
      archive.finalize();
    }
  }

  this.spine.forEach(function(inputURL, page_index) {
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
        headings: self.getHeadings($, href)
      };

      appendContent(data, inputURL, --pagesToFetch);
    }, function(error) {
      console.error('Could not get ' + inputURL + ' - ' + error.message);
    });
  });
};

