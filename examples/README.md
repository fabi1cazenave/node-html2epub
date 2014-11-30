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

