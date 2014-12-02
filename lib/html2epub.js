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
// custom
var util     = require('./util');


/**
 * Constructor
 */

var html2epub = module.exports = function html2epub(options) {
  options = options || {};
  if (!(this instanceof html2epub)) {
    return new html2epub(options);
  }

  // metadata (TODO: extract title/charset/language from HTML metadata)
  this.identifier = options.identifier || util.newUUID();
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
  this.keepAllHeadings =
    !!options.keepAllHeadings; // ignore headings that have no usable ID/anchor

  // list of HTML files to convert to EPUB (XXX do not use process.cwd here)
  this.basedir = options.basedir || process.cwd();
  this.spine   = options.spine   ||
    util.findFilesSync(this.basedir, util.htmlFilter);

  // output file
  this.outputFile = util.getNonExistingFileSync(options.outputFile ||
    path.basename(this.basedir) + '.epub');
};


/**
 * Headings:
 * .getHeadings(document, href)
 * .parseHeadingsSync()
 */

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

    var id = util.getHeadingID(elt);
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

html2epub.prototype.showToC = function showToC(pages, format) {
  var output = '';
  pages = pages || this.parseHeadingsSync();
  format = format || this.format;

  switch (format) {
    case 'txt':
      output = util.buildToC_txt(pages, this.depth);
      break;

    case 'json':
      var toc = util.buildToC_json(pages, this.depth, this.strict);
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
        '\n  ' + util.buildToC_ncx(pages, this.depth) +
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
        '\n' + util.buildToC_xhtml(pages, this.depth) +
        '\n</body>' +
        '\n</html>';
      break;

    default:
      console.error('unsupported output format: "' + format + '"');
  }

  return output;
};


/**
 * EPUB index:
 * .showOPF(files)
 */

html2epub.prototype.showOPF = function showOPF(files) {
  var dc = '';
  for (var key in this.dc) {
    dc += '\n    <dc:' + key + '>' + this.dc[key] + '</dc:' + key + '>';
  }

  var nodes = util.buildOPF(files, this.spine);
  var opf = '<?xml version="1.0" encoding="' + this.charset + '"?>' +
    '\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">' +
    '\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '\n    <dc:identifier id="uuid">' + this.identifier + '</dc:identifier>' +
    '\n    <dc:title>' + this.title + '</dc:title>' +
    '\n    <dc:language>' + this.language + '</dc:language>' + dc +
    '\n    <meta property="dcterms:modified">' + this.modified + '</meta>' +
    '\n  </metadata>' + nodes.manifest + nodes.spine +
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

html2epub.prototype.convertSync = function convertSync() {
  var rootfile = 'EPUB/content.opf';
  var tocEPUB3 = 'EPUB/toc.xhtml';
  var tocEPUB2 = 'EPUB/toc.ncx';

  var basedir = this.basedir;
  function fileExists(filename) {
    return fs.existsSync(path.resolve(basedir, filename));
  }

  // create an EPUB archive
  var archive = util.epubArchive(this.outputFile, rootfile);

  // append EPUB indexes
  var files = util.findFilesSync(basedir);
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

html2epub.prototype.convert = function convert(callback) {
  var self = this;

  var rootfile = 'EPUB/content.opf';
  var archive = util.epubArchive(this.outputFile, rootfile, callback);

  var pages = new Array(this.spine.length);
  var pagesToFetch = this.spine.length;

  var resourceURLs = [];
  var resourcesToFetch = resourceURLs.length;

  function appendIndex() {
    resourceURLs.forEach(function(element, index, array) {
      array[index] = element.replace(util.httpFilter, '');
    });
    self.spine.forEach(function(element, index, array) {
      array[index] = element.replace(util.httpFilter, '');
      resourceURLs.push(element.replace(util.httpFilter, ''));
    });
    resourceURLs.push('toc.xhtml');
    resourceURLs.push('toc.ncx');
    archive.append(self.showOPF(resourceURLs  ), { name: 'EPUB/content.opf' });
    archive.append(self.showToC(pages, 'xhtml'), { name: 'EPUB/toc.xhtml'   });
    archive.append(self.showToC(pages, 'ncx'  ), { name: 'EPUB/toc.ncx'     });
  }

  function appendContent(data, href) {
    archive.append(data, { name: 'EPUB/' + href.replace(util.httpFilter, '') });
    if (!pagesToFetch && !resourcesToFetch) {
      appendIndex();
      archive.finalize();
    }
  }

  this.spine.forEach(function(inputURL, page_index) {
    util.download(inputURL, '', function(data) {
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
          util.download(href, 'binary', function(data) {
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

      var href = inputURL.replace(util.httpFilter, '');
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

