def process( app ):
	app.response.output += str(app.query.parms)+"""
TODO: Liefert eine Liste von eindeutigen Objektschlüsseln zurück, die zu einem
gegebenen Suchkriterium passen.
"""

