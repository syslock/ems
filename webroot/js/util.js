function open_page( doc )
{
	document.location.href = doc
}

function parse_result( result )
{
	try
	{
		var False = false;
		var True = true;
		var None = undefined;
		result = eval( "("+result+")" )
		$(".ems-error")[0].innerHTML = ""
	}
	catch( e )
	{
		$(".ems-error")[0].innerHTML = "Error parsing response: "+e;
	}
	if( result.error )
	{
		$(".ems-error")[0].innerHTML = result.error.trace.join("");
	}
	else $(".ems-error")[0].innerHTML;
	return result;
}

function change_style( style )
{
	set_cookie( "style", style )
	$("#main_style")[0].href="css/"+style+".css"
	var menu_style = $(".menu-style")[0]
	if( menu_style ) menu_style.value = style;
}

function get_cookie( key )
{
	var cookies = {}
	var _cookies = document.cookie.match( /([^=; ]*)=(?:"([^"]*)"|([^;]*))/g )
	for( i in _cookies )
	{
		var _cookie = _cookies[i].match( /([^=; ]*)=(?:"([^"]*)"|([^;]*))/ )
		cookies[ _cookie[1] ] = _cookie[2] ? _cookie[2] : _cookie[3]
	}
	return cookies[ key ]
}

function set_cookie( key, value, path, expires )
{
	del_cookie( key );
	if( !expires )
	{
		var d = new Date()
		d.setFullYear( d.getFullYear()+1 )
		expires = d.toGMTString()
	}
	document.cookie = key + "=" + value + "; path=" + (path ? path : "/") + "; expires="+expires;
}

function del_cookie( key, path )
{
    document.cookie = key + "=" + "; path=" + (path ? path : "/") + "; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
}

