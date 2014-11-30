alice
-----

This local XHTML copy of Gutenberg’s “[Alice’s Adventures in Wonderland](http://www.gutenberg.org/1/11/)” can be converted to a [valid](http://validator.idpf.org/) EPUB3 document without any configuration:

```
html2epub --basedir=alice
```

Rather than creating a whole EPUB3 file, html2epub can also be used to generate
EPUB index files, i.e. the table of content (supported formats: txt, json,
xhtml, ncx) or the `content.opf` file. For example:

```
html2epub --basedir=alice --format=txt
html2epub --basedir=alice --format=ncx
html2epub --basedir=alice --format=opf
```

The `headings` parameter can be used to remove the main title from the table of contents:

```
html2epub --basedir=alice --format=txt --headings=h2
```

epub3
-----

The [online EPUB 3.0.1 spec](http://idpf.org/epub/301) can be compiled to a local EPUB like this:

```
html2epub --config=epub3.json
```

The `spine` section of this JSON file contains the list of the URLs to fetch;
html2epub downloads all related stylesheets and media (images, audio, video).

All indexes are generated automatically. Note how the `headings` option defines
a proper CSS selector to ignore the `<h3>` elements that aren’t related to
titles.

html5
-----

Same thing for the [online HTML5 reference](http://www.w3.org/TR/html5/):

```
html2epub --config=html5.json
```

Again, a specific `headings` option is required to properly filter the titles.

