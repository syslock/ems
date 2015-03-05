import re


class Lexer:
	# list from: http://fasforward.com/list-of-european-special-characters/
	eu_chars = "¡¿ÄäÀàÁáÂâÃãÅåǍǎĄąĂăÆæÇçĆćĈĉČčĎđĐďðÈèÉéÊêËëĚěĘęĜĝĢģĤĥÌìÍíÎîÏïĴĵĶķĹĺĻļŁłĽľÑñŃńŇňÖöÒòÓóÔôÕõŐőØøŒœŔŕŘřẞßŚśŜŝŞşŠšŤťŢţÞþÜüÙùÚúÛûŰűŨũŲųŮůŴŵÝýŸÿŶŷŹźŽžŻż"
	
	@classmethod
	def scan( cls, data ):
		words = []
		# character chunks between whitespaces and several punctuation marks:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[ \t\r\n,.;!?:%"=]', data) if word ])]
		# chunks of latin and several derived characters, numbers and some currency symbols:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[^a-zA-Z0-9$€£¢#%s]' % (cls.eu_chars), data) if word ])]
		# host and file names:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[^a-zA-Z0-9\-_.$€£¢#%s]' % (cls.eu_chars), data) if word ])]
		# numbers only:
		words += [(i,w) for i,w in enumerate([ word.lower() for word in re.split(r'[^0-9]', data) if word ])]
		return words
