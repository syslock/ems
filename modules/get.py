def process( app ):
	app.response.output += str(app.query.parms)+"""
TODO: Liefert einen serialisierten (JSON, HTML?) Objektbaum unterhalb eines
eindeutigen Objektschlüssels zurück. Siehe store.
"""

