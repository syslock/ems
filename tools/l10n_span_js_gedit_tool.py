#!/usr/bin/python
import sys
import time
sys.stdout.write( 'LS("%s","%s")\n' % (time.strftime("%Y%m%d%H%M%S"),sys.stdin.read()) )

