var language = "en"

var caption = {
	"20120513122714" : { "de" : "Abmelden", 
						 "en" : "Logout" },
	"20120513130121" : { "de" : "Bewerbung", 
						 "en" : "Application" },
	"20120513130138" : { "de" : "Hier kannst du deine Bewerbung formulieren.", 
						 "en" : "You may write your application here." },
	"20120513130151" : { "de" : "Beitrag erstellen", 
						 "en" : "Create Entry" },
	"20120513130201" : { "de" : "Bearbeiten", 
						 "en" : "Edit" },
	"20120513154437" : { "de" : "Anmeldung", 
						 "en" : "Login" },
	"20120513154451" : { "de" : "Benutzername:", 
						 "en" : "User name:" },
	"20120513154515" : { "de" : "Passwort:", 
						 "en" : "Password:" },
	"20120513154532" : { "de" : "Anmelden", 
						 "en" : "Login" },
	"20120513154545" : { "de" : "Noch nicht registriert?", 
						 "en" : "Not yet registered?" },
	"20120513154559" : { "de" : "Passwort wiederholen:", 
						 "en" : "Password (repeated):" },
	"20120513154611" : { "de" : "Vor- und Nachname:", 
						 "en" : "Full name:" },
	"20120513154623" : { "de" : "E-Mail-Adresse:", 
						 "en" : "Email address:" },
	"20120513154632" : { "de" : "Registrieren", 
						 "en" : "Register" },
	"20120513160559" : { "de" : "Titel:", 
						 "en" : "Title:" },
	"20120513161628" : { "de" : "Speichern", 
						 "en" : "Save" },
	"20120513162048" : { "de" : "Bearbeiten", 
						 "en" : "Edit" },
	"20120513162118" : { "de" : "Passwörter müssen übereinstimmen", 
						 "en" : "Passwords have to be equal" },
}

function L( key, result )
{
	if( caption[key] && caption[key][language] )
	{
		result = caption[key][language]
	}
	return result
}

function LS( key, result )
{
	return '<span id="'+key+'" class="L">'+L(key, result)+'</span>'
}

function localize_element( e )
{
	e.innerHTML = L(e.id, e.innerHTML)
}

function localize( new_lang )
{
	if( new_lang )
	{
		language = new_lang
	}
	$(".L").each(
	function(i,element)
	{
		localize_element( element )
	})
	$(".menu-language")[0].value = language;
}

function change_language( new_lang )
{
	localize( new_lang )
	// TODO: Sprache in Session speichern
}
