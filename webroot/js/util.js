function open_page( doc ) {
	document.location.href = doc;
}

function get_module_url( module, args ) {
	var l = document.location;
	var port = l.port ? ":"+String(l.port) : "";
	var pathname = l.pathname.replace(/\/$/,"/ems.wsgi")
	return l.protocol+"//"+l.hostname+port+pathname+'?' + $.param($.extend({'do':module}, args));
}

function get_tpl_url( tpl, args ) {
	return get_module_url('render', $.extend({'tpl':tpl}, args) );
}

function open_tpl( tpl, args ) {
	open_page( get_tpl_url(tpl, args) );
}

function get_tpl( tpl, parms ) {
	$.get( get_tpl_url(tpl, parms.args) )
		.done(parms.done ? parms.done : parse_result)
		.fail(parms.fail ? parms.fail : parse_result)
		.always(parms.always);
}

function get_module( module, parms ) {
	$.get( get_module_url(module, parms.args) )
		.done(parms.done ? parms.done : parse_result)
		.fail(parms.fail ? parms.fail : parse_result)
		.always(parms.always);
}

function get_ws_url( path ) {
	var l = document.location;
	var port = 8888;
	return "ws://"+l.hostname+":"+String(port)+( path ? path : "" );
}

function reload_page() {
	document.location.href = document.location.href;
}

function parse_result( result )
{
	if( typeof(result)=="object" ) {
		var xhr = result;
		result = xhr.responseText;
	}
	if( typeof(result)=="string" ) {
		try {
			result = JSON.parse( result );
		} catch( e ) {
			try {
				var False = false;
				var True = true;
				var None = undefined;
				result = eval( "("+result+")" );
			} catch( e ) {
				show_message( "Error parsing response: " )
				show_error( e+"\nwithin:\n\n("+result+")" );
				throw e;
			}
		}
	}
	hide_status();
	if( result.error ) {
		if( result.error.message ) {
			show_message( result.error.message );
			console.log( result.error.message );
		}
		if( result.error.trace ) {
			show_error( result.error.trace.join("") );
			console.log( result.error.trace.join("") );
		}
	}
	return result;
}

function show_message( text )
{
	$(".ems-message-content").text(text)
	$(".ems-message").addClass("ems-message-active");
	show_status()
}

function show_error( text )
{
	$(".ems-error-content").text(text)
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
	$(".ems-message-content").text("");
	$(".ems-error-content").text("");
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
	if( size==Infinity ) return "∞";
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

// https://stackoverflow.com/questions/2897155/get-cursor-position-in-characters-within-a-text-input-field
/*
** Returns the caret (cursor) position of the specified text field.
** Return value range is 0-oField.value.length.
*/
function get_input_cursor_pos( oField ) {
  // Initialize
  var iCaretPos = 0;
  // IE Support
  if (document.selection) {
    // Set focus on the element
    oField.focus ();
    // To get cursor position, get empty selection range
    var oSel = document.selection.createRange ();
    // Move selection start to 0 position
    oSel.moveStart ('character', -oField.value.length);
    // The caret position is selection length
    iCaretPos = oSel.text.length;
  }
  // Firefox support
  else if (oField.selectionStart || oField.selectionStart == '0')
    iCaretPos = oField.selectionStart;
  // Return results
  return (iCaretPos);
}

/* https://stackoverflow.com/questions/3972014/get-caret-position-in-contenteditable-div
The following code assumes:
- There is always a single text node within the editable <div> and no other nodes
- The editable div does not have the CSS white-space property set to pre */
function get_element_cursor_pos( editableDiv ) {
  var caretPos = 0,
    sel, range;
  if (window.getSelection) {
    sel = window.getSelection();
    if (sel.rangeCount) {
      range = sel.getRangeAt(0);
      if (range.commonAncestorContainer.parentNode == editableDiv) {
        caretPos = range.endOffset;
      }
    }
  } else if (document.selection && document.selection.createRange) {
    range = document.selection.createRange();
    if (range.parentElement() == editableDiv) {
      var tempEl = document.createElement("span");
      editableDiv.insertBefore(tempEl, editableDiv.firstChild);
      var tempRange = range.duplicate();
      tempRange.moveToElementText(tempEl);
      tempRange.setEndPoint("EndToEnd", range);
      caretPos = tempRange.text.length;
    }
  }
  return caretPos;
}

var get_cursor_pos = get_element_cursor_pos;

function get_cursor_word( text_input, parms ) {
	if( !parms ) {
		parms = {};
	}
	if( !parms.separators ) {
		parms.separators = " \t\r\n";
	}
	var cursor_pos = get_cursor_pos( text_input );
	var word = '';
	for( var pos=cursor_pos; pos<$(text_input).text().length && parms.separators.indexOf($(text_input).text().substr(pos,1))==-1; pos++ ) {
		word += $(text_input).text().substr(pos,1);
	}
	for( var pos=cursor_pos-1; pos>=0 && parms.separators.indexOf($(text_input).text().substr(pos,1))==-1; pos-- ) {
		word = $(text_input).text().substr(pos,1) + word;
	}
	return word;
}

function get_input_text_before_cursor( text_input, parms ) {
	if( !parms ) {
		parms = {};
	}
	if( !parms.separators ) {
		parms.separators = " \t\r\n";
	}
	var cursor_pos = get_cursor_pos( text_input );
	var result = $(text_input).text().substr(0,cursor_pos);
	if( parms.remove_trailing_word ) {
		result+="x" // dummy trail
		var pos=cursor_pos;
		for( ; pos>=0 && parms.separators.indexOf(result.substr(pos,1))==-1; pos-- );
		result = result.substr(0,pos+1);
	}
	return result;
}
