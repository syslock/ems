#!/usr/bin/python
import sys
import time
sys.stdout.write( '<span class="L" id="%s">%s</span>\n' % (time.strftime("%Y%m%d%H%M%S"),sys.stdin.read()) )

