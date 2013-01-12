var language = "en"

var caption = {
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

function change_language( new_lang ) {
	if( get_cookie("lang")!=new_lang ) {
		set_cookie( "lang", new_lang );
		//localize( new_lang );
		reload_page();
	}
	var menu_language = $(".menu-language")[0];
	if( menu_language ) menu_language.value = new_lang;
}
