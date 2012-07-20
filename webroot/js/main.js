require( ["jquery","util","login","entry","localization"], 
	function($) {
		if( init )
		{
			$(document).ready( init() )
		}
		var lang = get_cookie( "lang" )
		var menu_language = $(".menu-language")[0]
		if( !lang && menu_language ) lang = menu_language.value;
		if( lang )
		{
			change_language( lang );
		}
		var style = get_cookie( "style" )
		var menu_style = $(".menu-style")[0]
		if( !style && menu_style ) style = menu_style.value;
		if( style )
		{
			change_style( style );
		}
	}
);
