`et_types` simply stands for Expense Tracker Types

This naming is required to prevent errors when using packages
```shell
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "C:\Users\Timot\AppData\Local\pypoetry\Cache\virtualenvs\expense-tracker-GhNAN0yX-py3.10\lib\site-packages\pandera\__init__.py", line 3, in <module>
    import platform
  File "C:\Users\Timot\.pyenv\pyenv-win\versions\3.10.11\lib\platform.py", line 117, in <module>
    import re
  File "C:\Users\Timot\.pyenv\pyenv-win\versions\3.10.11\lib\re.py", line 124, in <module>
    import enum
  File "C:\Users\Timot\.pyenv\pyenv-win\versions\3.10.11\lib\enum.py", line 2, in <module>
    from types import MappingProxyType, DynamicClassAttribute
ImportError: cannot import name 'MappingProxyType' from 'types' (C:\Users\Timot\Documents\GitHub\expense-tracker\expense_tracker\types\__init__.py)
```