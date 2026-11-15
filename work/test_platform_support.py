import os
import unittest
from unittest.mock import patch
from platform_test_support import chromium_args, available_memory_mb


class PlatformSupportTest(unittest.TestCase):
    def test_platform_flags(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIn('--use-angle=metal', chromium_args('darwin'))
            self.assertIn('--use-angle=d3d11', chromium_args('win32'))
            self.assertIn('--use-angle=swiftshader', chromium_args('linux'))

    def test_ci_without_physical_gpu(self):
        with patch.dict(os.environ, {'CI': 'true'}):
            for host in ('darwin', 'win32', 'linux'):
                self.assertIn('--use-angle=swiftshader', chromium_args(host))
                self.assertNotIn('--use-angle=metal', chromium_args(host))

    def test_real_host_memory(self):
        self.assertGreater(available_memory_mb(), 0)


if __name__ == '__main__':
    unittest.main()
