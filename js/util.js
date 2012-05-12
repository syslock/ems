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

