function open( doc )
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
	$("#main_style")[0].href="css/"+style+".css"
}

