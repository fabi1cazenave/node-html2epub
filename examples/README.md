epub301
-------

This local copy of the [EPUB 3.0.1 spec](http://idpf.org/epub/301) can be compiled to EPUB like this:
```
html2epub --basedir=epub301 --config=epub301.json --format=epub
```

html5
-----

Creating an EPUB from the [online HTML5 reference](http://www.w3.org/TR/html5/) is as simple as:
```
html2epub --config=html5.json
```

The JSON file is very similar to `epub301.json`, except it contains the URLs of
all the HTML documents to fetch.

