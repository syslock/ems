import imp, re, json
from lib import db_object
db_object = imp.reload( db_object )

def process( app ):
	q = app.query
	if "phrase" in q.parms:
		search_phrase = q.parms["phrase"]
		search( app, search_phrase )
	elif "apropos" in q.parms:
		prefix = q.parms["apropos"]
		apropos( app, prefix )

def search( app, search_phrase ):
	q = app.query
	words = [ word.lower() for word in re.split(r'[^a-zA-Z0-9äöüßÄÖÜ%]',search_phrase) if word ]
	valid_types = q.parms["types"].split(",") if "types" in q.parms else []
	valid_sources = q.parms["sources"].split(",") if "sources" in q.parms else []
	source_query = ""
	if valid_sources:
		source_query = " and source in ?" #FIXME: sqlite-api kann keine tuple binden!
	raw_results = {}
	c = app.db.cursor()
	for word in words:
		c.execute( """select object_id, word, pos, scan_source, o.type from keywords 
						inner join objects o on o.id=object_id
						where word like ? %(source_query)s order by object_id, pos""" % locals(), [word] )
		for row in c:
			object_id, word, pos, scan_source, object_type = row
			if object_id in raw_results:
				raw_results[object_id].append( row )
			else:
				raw_results[object_id] = [ row ]
	word_hits = {} # hiermit zählen wir Treffer pro Suchwort im gefilterten Endergebnis
	for word in words:
		word_hits[word] = 0
	# 1.) Wir machen eine Zugriffsprüfung, filtern die Trefferliste entsprechend und 
	#     konsolidieren die Trefferliste ggf. auf Elternobjekte mit passendem Typ, sodass z.b.
	#     Blog-Einträge für auf die Volltextsuche passende plain/text-Objekte gefunden werden:
	filtered_results = {}
	for result_id in raw_results:
		for hit in raw_results[result_id]:
			object_id, word, pos, scan_source, object_type = hit
			if app.user.can_read( object_id ):
				if object_type in valid_types or not valid_types:
					if object_id in filtered_results:
						filtered_results[object_id].append( hit )
					else:
						filtered_results[object_id] = [ hit ]
					if word in word_hits:
						word_hits[word] += 1
				else:
					obj = db_object.DBObject( app, object_id )
					matching_parents = obj.resolve_parents( parent_type_set=valid_types )
					for parent_id in matching_parents:
						if app.user.can_read( parent_id ):
							if parent_id in filtered_results:
								filtered_results[parent_id].append( hit )
							else:
								filtered_results[parent_id] = [ hit ]
							if word in word_hits:
								word_hits[word] += 1
	# 2.) Treffer sinnvoll sortieren, wobei:
	# - Anzahl treffender Suchbegriffe verstärkend wirken: len(filtered_results[x])
	# - Gesamtzahl der Treffer aller treffenden Suchbegriffe abschwächend wirken: /sum(...)
	# TODO: Testen ob das hilfreiche Trefferlisten ergibt und optimale Wichtung finden
	hitlist = sorted( filtered_results, key=(lambda x: len(filtered_results[x]) / sum([(word_hits[w] if w in word_hits else 1) for w in set([r[1] for r in filtered_results[x]])])), reverse=True )
	result = {
		"hitlist" : hitlist,
		"reasons" : {}
	}
	
	for hit_id in hitlist:
		result["reasons"][hit_id] = filtered_results[hit_id]
	app.response.output += json.dumps( result )

def apropos( app, prefix ):
	q = app.query
	c = app.db.cursor()
	word_counts = {}
	pattern = prefix+"%"
	c.execute( """select object_id, word, rank from keywords 
					where word like ?""", [pattern] )
	for row in c:
		obj_id, word, rank = row
		if app.user.can_read( obj_id ):
			if word not in word_counts:
				word_counts[word] = { "count":0, "rank":0 }
			counter = word_counts[word]
			counter["count"]+=1
			counter["rank"]+=rank
			
	result = sorted( word_counts.items(), key=(lambda x: x[0]) )
	app.response.output += json.dumps( result )
