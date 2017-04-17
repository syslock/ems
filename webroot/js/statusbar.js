// FIXME: module encapsulation:
var StatusBar = null;

define(["jquery"], function($) {
StatusBar = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	my.dom_parent = parms.dom_parent ? parms.dom_parent : document.documentElement;
	my.init( parms );
};

StatusBar.prototype.init = function( parms ) {
	var my = this;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/statusbar.html"},
			done : function(result) {
				StatusBar.prototype.template = result;
				my.init( parms );
			}, 
			fail : function(result) {
				show_error( result )
			}
		});
		GlobalRequestQueue.process();
	} else {
		my.dom_object = $( "<div>" );
		my.dom_object.html( my.template );
		$(my.dom_parent).append( my.dom_object );
		my.statusbar = $( ".statusbar", my.dom_object );
		my.statusbar.unwrap();
		my.statusbar_button = $( ".statusbar-button", my.statusbar );
		my.statusbar_button.on( "click", function() { my.toggle(); } );
		my.statusbar_content = $( ".statusbar-content", my.statusbar );
		my.message_template = $( ".message-template", my.statusbar );
	}
};

StatusBar.prototype.add_message = function( parms ) {
	var my = this;
	var cls = parms.class ? parms.class : "message";
	var css = parms.css ? parms.css : {};
	var emblem_css = parms.emblem_css ? parms.emblem_css : {};
	var source = parms.source ? parms.source : "system";
	var text = parms.text ? parms.text : "";
	var timestamp = (new Date()).toLocaleFormat("%H:%M:%S");
	var message = my.message_template.clone().removeClass( "message-template").addClass( cls ).css( css );
	var message_emblem = $( ".message-emblem", message ).css( emblem_css );
	var message_time = $( ".message-time", message );
	message_time.text( timestamp );
	var message_source = $( ".message-source", message );
	message_source.text( source );
	var message_text = $( ".message-text", message );
	message_text.text( text );
	my.statusbar_content.prepend( message );
	message.show();
};

StatusBar.prototype.toggle = function() {
	var my = this;
	if( my.statusbar.hasClass( "hidden" ) ) {
		my.show();
	} else {
		my.hide();
	}
};

StatusBar.prototype.show = function() {
	var my = this;
	my.statusbar.removeClass( "hidden" );
};

StatusBar.prototype.hide = function() {
	var my = this;
	my.statusbar.addClass( "hidden" );
};

return StatusBar;
}); //define()
