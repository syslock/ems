// FIXME: module encapsulation:
var Image = null;

define(["jquery","item"], function($,BaseItem) {
Image = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	BaseItem.call( this, parms );
};
Image.prototype = Object.create( BaseItem.prototype );
Image.prototype.constructor = Image;

Image.prototype.init = function() {
	var my = this;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/image.html"},
			done : function(result) {
				Image.prototype.template = result;
				my.init();
			}, 
			fail : function(result) {
				show_error( result )
			}
		});
		GlobalRequestQueue.process();
	} else {
		BaseItem.prototype.init.call( this );
		my.expander = $( ".image-expander", my.dom_object );
		my.image = $( ".image", my.dom_object );
		
		$(my.dom_object).attr( {title: my.obj.title} );
		
		my.rotation = 0;
		my.grip_rotate = $( ".image-rotate-grip", my.dom_object );
		my.rotate_symbol = $( ".image-rotate-symbol", my.grip_rotate );
 		my.rotate_symbol.attr( {draggable : true} );
		my.rotate_symbol.on( "dragstart", function(ev) {
			my.rotate_left.show();
			my.rotate_right.show();
			ev.originalEvent.dataTransfer.setData("text/plain","dummy");
			my.dragstart_x = ev.originalEvent.clientX;
			my.dragstart_y = ev.originalEvent.clientY;
			my.dragstart_rotation = my.rotation;
			var rect = my.grip_rotate[0].getBoundingClientRect();
			my.grip_rotate.css( {position:"fixed", left: rect.left, top: rect.top} );
		});
		my.rotate_symbol.on( "dragend", function(ev) {
			my.rotate_left.hide();
			my.rotate_right.hide();
			my.set_rotate_grip_position();
		});
		my.rotate_left = $( ".image-rotate-left", my.grip_rotate );
		my.rotate_left.hide();
		my.rotate_right = $( ".image-rotate-right", my.grip_rotate );
		my.rotate_right.hide();
		my.auto_save_timeout = 1000;
		my.auto_save_timeout_obj = null;
		my.expander.on( "dragover", function(ev) {
			var x_diff = ev.originalEvent.clientX - my.dragstart_x;
			var rotation_diff = my.rotation - my.dragstart_rotation;
			var rotation_change = x_diff/1.5 - rotation_diff;
			if( rotation_change && (my.rotation%90!=0 || Math.abs(rotation_change)>10) ) {
				my.rotate( rotation_change );
				if( my.auto_save_timeout_obj ) window.clearTimeout( my.auto_save_timeout_obj );
				my.auto_save_timeout_obj = window.setTimeout( function() {
					GlobalRequestQueue.add({
						module : "store", args : {id : my.obj.id, rotation : my.rotation}
					});
					GlobalRequestQueue.process();
				}, my.auto_save_timeout );
			}
		});
		
		// show remove button and rotation grip when parent entry is in edit mode and user has required permissions:
		var parent_content = $(my.dom_parent).closest('.entry-content')[0];
		if( parent_content && parent_content.isContentEditable ) {
			if( my.obj.permissions.indexOf("write")>=0 ) {
				$(my.grip_rotate).show();
			} else {
				$(my.grip_rotate).hide();
			}
		} else {
			$(my.grip_rotate).hide();
		}
		
		my.image.css( {'visibility': 'hidden'} );
		my.image.attr( {src: get_module_url("get", {id : my.obj.id, view : "data"}), class: 'entry-media'} );
		my.image.on( "load", function(){ 
			my.compute_dimensions(); 
			my.set_rotate_grip_position(); 
			get_module("get", {
				args: {id : my.obj.id, view : "all"}, 
				done : function( result ) {
					var image_info = parse_result( result )[0];
					if( image_info.rotation ) {
						my.rotate( Number(image_info.rotation) );
					}
					my.image.css( {'visibility': 'visible'} );
			}});
		});
	}
};

Image.prototype.set_rotate_grip_position = function() {
	var my = this;
	my.grip_rotate.css( {position:"absolute", left: my.current_width/2-my.rotate_symbol.outerWidth()/2, top: my.current_height/2-my.rotate_symbol.outerHeight()/2} );
};

Image.prototype.compute_dimensions = function() {
	var my = this;
	// store original image dimensions
	my.orig_width = my.image.outerWidth();
	my.orig_height = my.image.outerHeight();
	my.current_width = my.orig_width;
	my.current_height = my.orig_height;
	// maximum render width available for an image:
	my.max_width = my.expander.innerWidth();
	// compute image diagonal (bottom left -> top right)
	my.z = Math.sqrt( my.orig_width*my.orig_width + my.orig_height*my.orig_height );
	// compute ascent angle of image diagonal (from bottom edge)
	my.alpha = Math.asin( my.orig_width / my.z );
};

Image.prototype.rotate = function( rotation_change ) {
	var my = this;
	function rad(x) {
		return x/180*Math.PI;
	}
	function degrees(x) {
		return x*180/Math.PI;
	}
	my.rotation = (my.rotation + rotation_change) % 360;
	while( my.rotation < 0 ) {
		my.rotation += 360;
	}
	var lambda = rad(my.rotation);
	var delta = undefined;
	// compute angle deviation (delta) of rotated image diagonal from horizontal orientation:
	// (do not know why this has to be done differently for every quadrant)
	if( my.rotation <= 90 ) delta = my.alpha+lambda-rad(90);
	else if( my.rotation <= 180 ) delta = my.alpha-lambda+rad(90);
	else if( my.rotation <= 270 ) delta = my.alpha+lambda-rad(90);
	else if( my.rotation <= 360 ) delta = my.alpha-lambda+rad(90);
	// compute maximum possible image diagonal to meet width constraints:
	var c = Math.abs( my.max_width / Math.cos( delta ) );
	var width = my.orig_width;
	var height = my.orig_height;
	if( c < my.z ) {
		// scale image down according to maximum possible image diagonal (c), 
		// if that is smaller then original image diagonal (my.z):
		height = Math.sqrt( c*c / (my.orig_width*my.orig_width/(my.orig_height*my.orig_height)+1) );
		width = my.orig_width/my.orig_height * height;
	}
	my.image.width( width );
	my.image.height( height );
	// rotate image according to current rotation angle, using css
	my.image.css( {"transform" : "rotate("+String(my.rotation)+"deg)"} );
	// compute and apply vertical flow expanders dimensions according to current rotation angle
	// (but do not decrease below original width/height to prevent image deformations)
	var new_width = Math.max( my.orig_width, Math.abs(width * Math.cos(lambda)) + Math.abs(height * Math.sin(lambda)) );
	var new_height = Math.max( my.orig_height, Math.abs(width * Math.sin(lambda)) + Math.abs(height * Math.cos(lambda)) );
	my.expander.innerWidth( new_width );
	my.expander.innerHeight( new_height );
	// compute and apply render offset for scaled and rotated image, to be centered within its flow expander
 	var x_off = (new_width-width)/2;
	var y_off = (new_height-height)/2;
	my.image.css( {"position":"relative", "left":x_off, "top":y_off} );
	my.current_width = new_width;
	my.current_height = new_height;
};

return Image;
}); //define()
