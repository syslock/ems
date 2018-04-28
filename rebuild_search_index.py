#!/usr/bin/env python3

import os, sys, time, re
from lib import application
from lib.lexer import Lexer

scan_sources = [
	("title", "titles", "object_id", "data", 3),
	("text", "text", "object_id", "data", 2),
	("nick", "users", "object_id", "nick", 2),
	("type", "objects", "id", "type", 1),
]

environ = { "REMOTE_ADDR" : "localhost" }

app = application.Application( environ, lambda x,y: None, path=os.path.dirname(sys.argv[0]) )
c = app.db.cursor()
for scan_source_definition in scan_sources:
	scan_source, scan_table, id_column, data_column, rank = scan_source_definition
	scan_time = int( time.time() )
	c.execute( """PRAGMA synchronous = 0;""" )
	rows = c.execute( """select %(id_column)s, %(data_column)s from %(scan_table)s""" % locals() ).fetchall()
	for obj_id, data in rows:
		words = Lexer.scan( data )
		c.execute( """delete from keywords where object_id=? and scan_source=?""", [obj_id, scan_source] )
		for pos, word in words:
			c.execute( """insert into keywords (object_id, word, pos, rank, scan_source, scan_time)
					values(?, ?, ?, ?, ?, ?)""", [obj_id, word, pos, rank, scan_source, scan_time] )
app.close_db( commit=True ) # also commits pending changes
		
	
