#!/usr/bin/python

import sys, re, lxml.etree

results = []
files = sys.argv[1:]
for f in files:
	fh = open(f)
	text = fh.read()
	try:
		fh.seek(0)
		tree = lxml.etree.parse( fh )
		elements = tree.xpath("//*[@class='L']" )
		for e in elements:
			key = e.xpath("string(./@id)").strip()
			value = e.xpath("string(.)").strip()
			results.append( (key,value) )
	except lxml.etree.XMLSyntaxError as e:
		pass
	fh.close()
	matches = re.findall( """LS?\(\s*["']([0-9]*)["']\s*,\s*["'](.*?)["']\s*\)""", text, re.DOTALL )
	results += matches
results.sort()
for result in results:
	key, value = result
	print( '\t"%(key)s" : { "de" : "%(value)s",\n\t\t\t\t\t\t "en" : "" },' % locals() )
	
