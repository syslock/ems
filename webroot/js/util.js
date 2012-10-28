function open_page( doc )
{
	document.location.href = doc
}

function open_tpl( tpl )
{
	/* FIXME: Wie können wir den WSGI-Handler konfigurierbar machen? */
	open_page( 'ems.wsgi?do=render&tpl='+tpl )
}

function reload_page() {
	document.location.href = document.location.href
}

function parse_result( result )
{
	try
	{
		var False = false;
		var True = true;
		var None = undefined;
		result = eval( "("+result+")" )
		hide_status()
	}
	catch( e )
	{
		show_error( "Error parsing response: "+e+"\nwithin:\n\n("+result+")" );
		throw e;
	}
	if( result.error )
	{
		show_error( result.error.trace.join("") );
	}
	return result;
}

function show_message( text )
{
	$(".ems-message")[0].innerHTML += text
	$(".ems-message")[0].style.display = "block"
	show_status()
}

function show_error( text )
{
	$(".ems-error")[0].innerHTML += text
	$(".ems-error")[0].style.display = "block"
	show_status()
}

function show_status()
{
	$(".ems-status")[0].style.display = "block"
}

function hide_status()
{
	$(".ems-status")[0].style.display = "none"
	$(".ems-message")[0].style.display = "none"
	$(".ems-error")[0].style.display = "none"
	$(".ems-message")[0].innerHTML = ""
	$(".ems-error")[0].innerHTML = ""
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

var store_latency = 2000 //milliseconds
var store_request_time = {};
var store_request_count = {};
function scheduled_store( store_func, obj ) {
	var curr_time = (new Date()).getTime();
	var time_diff = curr_time - store_request_time[obj.id];
	store_request_count[obj.id] -= 1;
	if( (time_diff >= store_latency) || (store_request_count[obj.id] == 0) ) {
		// Speicherlatenz erreicht oder vorerst letzte Chance -> Speichern!
		store_func(obj);
	}
}
function request_store( store_func, obj ) {
	var curr_time = (new Date()).getTime();
	store_request_time[obj.id] = curr_time;
	store_request_count[obj.id] = ( store_request_count[obj.id]==undefined ? 1 : store_request_count[obj.id]+1 );
	window.setTimeout( scheduled_store, store_latency, store_func, obj );
}

function hilight( field, color, width )
{
	field.style.border = String(width ? width : 3)+"px solid"
	field.style.borderColor = color ? color : "red"
	field.style.borderRadius = "3px"
}

function backlight( field, color )
{
	field.style.backgroundColor = color ? color : "#ffd0d0"
}

function unlight( field )
{
	field.style.border = ""
	field.style.borderColor = ""
	field.style.borderRadius = ""
	field.style.backgroundColor = ""
}

function onenter( event, dostuff )
{     
	if( event.keyCode==13 ) dostuff();
}

