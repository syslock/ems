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
		show_message( "Error parsing response: " )
		show_error( e+"\nwithin:\n\n("+result+")" );
		throw e;
	}
	if( result.error )
	{
		if( result.error.message ) show_message( result.error.message );
		if( result.error.trace ) show_error( result.error.trace.join("") );
	}
	return result;
}

function show_message( text )
{
	$(".ems-message-content")[0].innerHTML += text
	$(".ems-message").addClass("ems-message-active");
	show_status()
}

function show_error( text )
{
	$(".ems-error-content")[0].innerHTML += text
	$(".ems-error").addClass("ems-error-active");
	show_status()
}

function show_status()
{
	$(".ems-status").addClass("ems-status-active");
}

function hide_status()
{
	$(".ems-status").removeClass("ems-status-active");
	$(".ems-message").removeClass("ems-message-active");
	$(".ems-error").removeClass("ems-error-active");
	$(".ems-message-content").html("");
	$(".ems-error-content").html("");
}

function change_style( style )
{
	set_cookie( "style", style )
	$("#main_style")[0].href="css/"+style+".css"
	var menu_style = $(".menu-style")[0]
	if( menu_style ) menu_style.value = style;
}

function get_cookie( key ) {
	return $.cookie( key );
}

function set_cookie( key, value, path, expires ) {
	if( !expires ) {
		var expires = new Date()
		expires.setFullYear( expires.getFullYear()+1 )
	}
	$.cookie( key, value, {path: path ? path : "/", expires: expires} );
}

function del_cookie( key, path ) {
	$.removeCookie( key, {path: path ? path : "/"} );
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

function onenter( event, dostuff, arg )
{     
	if( event.keyCode==13 ) dostuff(arg);
}

function prettyprint_size( size ) {
	var value = size;
	var two_powers = 0;
	while( value>1000 ) {
		value /= 1024;
		two_powers += 10;
	}
	return String(value).match(/[0-9]*(:?\.[0-9]{0,2})?/)[0]+' '+({0:"Byte", 10:"KiB", 20:"MiB", 30:"GiB", 40:"TiB"})[two_powers];
}

function prettyprint_time( time ) {
	var value = time;
	var idx = 0;
	while( value>60 && idx<1 ) {
		value /= 60;
		idx += 1;
	}
	return String(value).match(/[0-9]*(:?\.[0-9]{0,2})?/)[0]+' '+({0:"s", 1:"min"})[idx];
}

