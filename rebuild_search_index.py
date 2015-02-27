#!/usr/bin/env python3

import os, sys, time, re
from lib import application

scan_sources = [
	("title", "titles", "object_id", "data", 3),
	("text", "text", "object_id", "data", 2),
	("nick", "users", "object_id", "nick", 2),
	("type", "objects", "id", "type", 1),
]

# list from: http://fasforward.com/list-of-european-special-characters/
eu_chars = "¡¿ÄäÀàÁáÂâÃãÅåǍǎĄąĂăÆæÇçĆćĈĉČčĎđĐďðÈèÉéÊêËëĚěĘęĜĝĢģĤĥÌìÍíÎîÏïĴĵĶķĹĺĻļŁłĽľÑñŃńŇňÖöÒòÓóÔôÕõŐőØøŒœŔŕŘřẞßŚśŜŝŞşŠšŤťŢţÞþÜüÙùÚúÛûŰűŨũŲųŮůŴŵÝýŸÿŶŷŹźŽžŻż"

environ = { "REMOTE_ADDR" : "localhost" }

app = application.Application( environ, lambda x,y: None, name="ems", path=os.path.dirname(sys.argv[0]) )
c = app.db.cursor()
for scan_source_definition in scan_sources:
	scan_source, scan_table, id_column, data_column, rank = scan_source_definition
	scan_time = int( time.time() )
	rows = c.execute( """select %(id_column)s, %(data_column)s from %(scan_table)s""" % locals() ).fetchall()
	for obj_id, data in rows:
		words = []
		# character chunks between whitespaces and several punctuation marks:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[ \t\r\n,.;!?:%"=]', data) if word ])]
		# chunks of latin and several derived characters, numbers and some currency symbols:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[^a-zA-Z0-9$€£¢#%s]' % (eu_chars), data) if word ])]
		# host and file names:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[^a-zA-Z0-9\-_.$€£¢#%s]' % (eu_chars), data) if word ])]
		# numbers only:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[^0-9]', data) if word ])]
		c.execute( """delete from keywords where object_id=? and scan_source=?""", [obj_id, scan_source] )
		app.db.commit()
		for pos, word in words:
			c.execute( """insert into keywords (object_id, word, pos, rank, scan_source, scan_time)
					values(?, ?, ?, ?, ?, ?)""", [obj_id, word, pos, rank, scan_source, scan_time] )
			app.db.commit()
		
	
