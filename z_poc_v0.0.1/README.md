# Expense Tracker
Lunch Money is a tool I'm using to track expenses. I want to export a summary report for my brother (and I) and create a briefer summary PNG to send in my family group chat with my parents.

Functionality
- Streamlit website to show last months transactions table AND last months summary graphs (category, merchant, location) AND year to date summary graphs (category, merchant, location)
- Excel with same graphs
- PNG with same graphs

## Usage
Client has actual usage of expense-tracker to generate stats

Python
- `cd client`
- `poetry install`
- `poetry shell`
  - `make run_streamlit`
  - `make run dash` - click "Download PNG" button to get report

Docker
- `docker build -t dash-expense-tracker . --build-arg LUNCH_MONEY_API_KEY=""`
- `docker run -p 8501:8501 dash-expense-tracker`
- `docker ps`

Kubernetes
- `docker pull timshee/dash-expense-tracker:0.1.0`
- `docker build -t dash-expense-tracker . --build-arg LUNCH_MONEY_API_KEY=""`
- `minikube start`
- `kubectl apply -f kubernetes/deployment.yaml`
- `kubectl apply -f kubernetes/service.yaml`
- `kubectl get pods`

### expense-tracker package
- `poetry install`
- `python -m unittest discover`

## Notes
Dash is way better for building reports than Streamlit (in fact, it's just easier in general because I always want to add icons and customize stuff)

### To Do
- generate full yearly report
  - [ ] YEAR summary
    - [ ] additional amount due
    - [ ] average per month
    - [ ] totals per month - compare actual to expected
  - [ ] MONTH by MONTH breakdown
    - [ ] transactions table w/ total bolded (date, amount, merchant, category, source)
  - [ ] YEAR breakdown
    - [ ] groceries/restaurants per month
    - [ ] top categories graph
    - [ ] top merchants graph
    - [ ] full categories list
    - [ ] full merchants list
- [ ] Plotly bar chart inverted - take absolute value
- [ ] Save to PDF button
---
- [ ] dash - mobile support
- [ ] datasource - cache results in SQLite database (per datasource?)
- [ ] expense_tracker - add library logging
- [ ] client - add logging and `logging.getLogger('name.of.library').propagate = False`
- [ ] StatisticService - improve performance of tags by doing subset comparison (`"tags <= filter_by_set" is a subset comparison checking if tags is a subset of filter_by_set`)
  - `mask = df['tags'].apply(lambda tags: False if tags is None else tags <= filter_by_set.column_value)`

### Done
- [X] ref: replace LunchMoneyTag with str
- 07/25 bugs
  - [X] Jun 1st not being included (check bounds)
  - [X] "source" not appearing when not Fidelity (eg: "Chase CREDIT CARD")
- [X] dash - Kubernetes
  ```
  docker pull timshee/dash-expense-tracker:0.1.0
  docker build -t dash-expense-tracker . --build-arg LUNCH_MONEY_API_KEY=""
  # generated YAML using ChatGPT: "write exact steps to use my Dockerfile with Kubernetes"
  kubectl apply -f kubernetes/deployment.yaml
  kubectl apply -f kubernetes/service.yaml
  # NOTE: double check tag name is correct, I pushed to DockerHub using 0.1.0 
  ```
- [X] dash - Dockerfile => DONE, pushed to DockerHub at [link](https://hub.docker.com/repository/docker/timshee/dash-expense-tracker/general)
  ```
  docker tag dash-expense-tracker timshee/dash-expense-tracker:0.1.0
  docker login
  docker push timshee/dash-expense-tracker:0.1.0
  ```
- [X] dash - normalize colors using Bootstrap
- [X] update repo description
- [X] streamlit - build in container to be deployable (Docker) => DONE for Streamlit
  - NOTE: This answer is great for debugging Dockerfile failures - https://stackoverflow.com/a/66770818
    - run in buildkit mode to get cache layer hashes
      - `DOCKER_BUILDKIT=0`
      - CMD: `set DOCKER_BUILDKIT=0`
      - Powershell: `$env:DOCKER_BUILDKIT=0`
    - open cache layer with: `docker run --rm -it <id_last_working_layer> bash -il`
  - `docker build -t streamlit-expense-tracker . --build-arg LUNCH_MONEY_API_KEY=""`
  - `docker run -p 8501:8501 streamlit-expense-tracker`
- [X] client - Streamlit => DONE
- [X] streamlit - fix upside down graphs => Not Doing, can't w/o changing value
- [X] fix: expense_tracker => DONE, make sure I don't use chained indexing with Python (`dfmi['one']['second']` is bad! `dfmi.loc[:, ('one', 'second')]` is good)
  ```
  See the caveats in the documentation: https://pandas.pydata.org/pandas-docs/stable/user_guide/indexing.html#returning-a-view-versus-a-copy
    df['date'] = df['date_arrow'].apply(lambda date: date.format('YYYY-MM-DD'))
  ```
- [X] ref: expense_tracker - rename `blah_df` to `df_blah` => find: `/(\s*)(\w+)(_df)(,?)/` AND replace: `$1df_$2$4`
- [X] streamlit - green checkmark (model to show if passed rent `1500`) => DONE, markdown HTML is great!
- [X] streamlit - implement `"Groceries vs Restaurants per Month"`
  - [X] fix: df to match expected `amount_groceries` and `amount_restaurants` 
- [X] StatisticServiceFilter - implement include/exclude functionality via `FilterCriteria` enum
- [X] StatisticServiceFilter - implement selecting by other columns besides tags (eg: only get "grocery" + "restaurant" category transactions)
  ```
  source: Series[str] = pa.Field()
  tags: Series[set[StatisticServiceFilter]] = pa.Field()
  merchant: Series[str] = pa.Field()
  description: Series[str] = pa.Field()
  amount: Series[int] = pa.Field()
  category: Series[str] = pa.Field()
  location: Series[str] = pa.Field()
  ```
- [X] StatisticServiceSort asc/desc on a column
---
- [X] lunch_money_datasource - filter out positive values OR ones with tag "Payment"
- [ ] client - Streamlit
  - [X] fix: `Timeframe` not hashable => adding a cache requires hashing any parameter passed
- [X] Lunch Money - upload Fidelity transactions => DONE, used tool inside Lunch Money instead of API (created account that uses manual transactions)
  - test script with one transaction
  - all transactions - add payee info (to get categories)
  - Jun/July latest transactions
- [X] Lunch Money - upload PayPal transactions => Don't need to, Fidelity was used to pay so all transactions are present there
- [X] Lunch Money - export all transactions to CSV for data analysis
  - [X] zscript
  - [X] unit test for zscript => did not do, instead used Run and Debug and then wrote scratch file content until I outputted the correct values to CSV
- [X] Lunch Money - manual import Fidelity + PayPal transactions from CSV => DONE, used Lunch Money tool instead of Python or Regex
  - [X] zscript
  - [X] unit tests for zscript => didn't do, just ran the POST
  - [X] PayPal transactions -> something isn't working when extracting PDF
  - [X] Fidelity transactions => regex and tossed into
- Datasource
  - [X] BaseDatasource - get_transactions
  - [X] LunchMoneyDatasource - get_transactions
- StatisticService
  - [X] calculate
  - [X] get

### Iced
- [ ] streamlit - add mobile support
- [ ] streamlit - build in container to be deployable (Kubernetes)
- [ ] client - PNG or PDF summary => Decided Against
  - [ ] spike: Discord integration
  - [ ] spike: Messenger integration
- [ ] client - Excel
  - [ ] spike: build in Google Sheets
- [ ] add pre commit hooks
---
- write ETL pipeline to get near real-time data
  - write Extract script to download transaction info
    - integrate w/ banks
  - update Transform script to run on transaction info
  - write Load script to save transaction info
    - build Google Sheets w/ pivot tables + graphs like "Timmy Expense Tracker"
- investigate using cron for ETL pipeline

### Learnings
- VSCode uses a JavaScript engine for its `find`
- Set up `launch.json` in `.vscode` workspace to get Run and Debug
  - Use "Run and Debug" to debug through zscripts and save output to file (this means I can iterate w/o rerunning the script from start which would send new `fetch` calls to the API. Python shell is great!)
  - NOTE: requires a `.env` with values: `PYTHONPATH=.` (not sure after I added `Command Variable` extension)

### Troubleshooting
- ERROR: pandas `groupby` removing columns when converting to list of dicts?
  - Solution: `reset_index` creates new columns from levels of index so it will convert nicely
- ERROR: VSCode fails to find unittest tests and tries to use pytest
  - Solution: add following to settings.json - `"python.experiments.optOutFrom": ["pythonTestAdapter"]`
- `poetry add python-dotenv`
  - DO NOT install `dotenv` as that is a different package
- ERROR: VSCode cannot find packages installed w/ Poetry
  - Solution: Cmd+Shift+P +  `Python: Select Interpreter` - selected 3.10.11 env that poetry created
- `poetry add numpy==1.26`
  - NumPy had a major `2.0` release on 16 Jun 2024 (1 week ago) and that breaks Pandera's compatability with Pandas
  - This command pins `numpy` version to the release before that major `2.0` release
  - NOTE: Installing this required explicit python version too: `python = "<3.13,>=3.10"`

### Bootstrap Steps
expense_tracker package
- shell
  ```shell
  mkdir -p expense-tracker/expense_tracker && touch expense-tracker/expense_tracker/__init__.py
  cd expense-tracker
  poetry init
  poetry add arrow
  poetry add --group dev black flake8 isort
  # implementing StatisticService
  poetry add pandera
  ```
- powershell
  ```powershell
  New-Item -ItemType Directory -Path "expense-tracker/expense_tracker" -Force
  New-Item -ItemType File -Path "expense-tracker/expense_tracker/__init__.py" -Force
  Set-Location "expense-tracker"
  poetry init
  poetry add arrow
  poetry add --group dev black flake8 isort
  ```

client
```shell
cd expense-tracker
mkdir client && cd client
touch utils.py streamlit_app.py
poetry init
poetry add arrow
poetry add git+https://github.com/Borghese-Gladiator/expense-tracker.git
# poetry add streamlit pandas numpy
# poetry add matplotlib
# generated example code via ChatGPT
# streamlit run .\streamlit.py
```
- client requires streamlit app be in parent and utils be a loaded module (unable to put in sibling directories)

<details>
<summary>Archive</summary>

## Methodology
```
Aggregate by Interval
APPROACH 1: custom build every group by incrementing arrow
    PRO: easy increment
    CON: hard group since I need to build bins and sort each into bins
APPROACH 2: custom column and standard group by
    PRO: easy group by
    CON: wasted extra column AND unable to support weekly?
```

# Expense Aggregation
Python ETL pipeline to build full transaction history from multiple credit cards

Currently, it is only one Pandas script that aggregates CSVs though

## Usage Instructions
- download transaction history
  - rename statements to include company name (can use `Powershell` script potentially)
    - if company not present in "company enum", write company parse logic in "find_transactions_table" and "normalize_transaction_df"
- update script "CONSTANTS"
- run locally
  ```
  poetry install
  poetry shell
  python main.py
  ```

## Notes

### Powershell
```powershell
# Define the folder path and the string to prepend
$FolderPath = "C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history"
$Prefix = "paypal_"

# Get all files in the specified folder and its subfolders
$Files = Get-ChildItem -Path $FolderPath -Recurse -File

# Loop through each file and rename it by prepending the specified string
foreach ($File in $Files) {
    $NewName = $Prefix + $File.Name
    Rename-Item -Path $File.FullName -NewName $NewName
}
```

### Bootstrap Steps
- `poetry init`
- `git init`
- write `.gitignore` using online `Python.gitignore`
- `poetry add loguru tabula-py[jpype] pandas`
  - NOTE: `tabula` is a package, but not related to reading PDFs
- write main.py
- download `financial_transaction_history` from all my credit card companies
- > write methodology
- [X] download PDFs
- [X] extract tables from PDFs to build transactions list CSV => gave up
- [X] download all as CSVs
- [X] build aggregated table
  - [X] add default column of rent_applicable_transaction
  - [X] remove credit 
- [X] create Excel spreadsheet
- [ ] build subset Excel spreadsheet by filter on rent_applicable_transaction column


### PDF Extraction Libraries
- pypdf
  - extract text and manually filter using index per type of PDF instead
  - Pros - very easy for library since I simply run `page.extract_text().split('\n')`
  - Cons
    - certain text gets appended together with no delimeter (eg: `Dec 11 Dec 11 MASALA BAYLITTLETONMA $116.37 `)
    - tons of custom code
      - pick page number
      - pick start of transaction list string
      - pick end of transaction list string
      - write logic to parse out each string
  - (possible implementation: Check row content to determine when to stop)
- camelot
  - NOTE: this package is quite garbage - it has unexpected namings/dependencies that must be installed separately (`camelot-py[base]`, `opencv-python`, `ghostscript`) AND does not work at parsing tables
  - `poetry add camelot-py[base]` (IT IS NOT `camelot`)
  - camelot-py installation
    - use Python 3.8 - depends on `pdftopng 0.2.3` which requires Python 3.8, 3.7, or 3.6.
    - `poetry add opencv-python`
    - download [Ghostscript](https://ghostscript.com/releases/gsdnld.html)
      - check installed with either command:
        - `gswin64c --version`
        - ```python
          import ctypes
          from ctypes.util import find_library
          find_library("".join(("gsdll", str(ctypes.sizeof(ctypes.c_voidp) * 8), ".dll")))
          ```
    - `poetry add ghostscript`
  - CLI usage
    - `camelot lattice -plot text .\capital_one_Smry_2023_1496.pdf`
      - `poetry add matplotlib` - `ImportError: matplotlib is required for plotting.`
  - NOTE: Did not find any text and could not figure out how to customize
- tabula
  - NOTE: tabula requires `JAVA` to be installed
  - `poetry add tabula-py`
  - > WARNING: The stream doesn't provide any stream length, using fallback readUntilEnd, at offset 64514
  - This warning indicates that the library is unable to determine the length of the PDF stream, so it falls back to a method called readUntilEnd.
  - Tabula works for basic tables, but my financial documents require customization. Tabula customizes via template which are generated by the desktop app.
    - the Tabula desktop app requires installation of ORACLE Java 8. Using OpenJDK 8 (Zulu) does not seem to work. Oracle Java 8 does not ship with an installer and requires manual config (JAVA_HOME I assume?). Either way, I elected against spending more effort on Java 8 which I would need to uninstall manually

#### PDF Methodology

Method A
- download PDFs
- extract tables from PDFs to build transactions list CSV
- build Excel spreadsheet from aggregated table
  - add default column of rent_applicable_transaction
- build subset Excel spreadsheet of rent applicable transactions using column

Method B
- download PDFs
- extract tables from PDFs to build transactions list CSV
- build Next.js webapp
	- display list of transactions in Material Table (filter + sort columns)
	- display list of J Shee transactions via hard-coded code
	- deploy to Vercel

### Troubleshooting

```
Package operations: 1 install, 0 updates, 0 removals

  - Installing pdftopng (0.2.3): Failed

  RuntimeError

  Unable to find installation candidates for pdftopng (0.2.3)

  at ~\AppData\Roaming\pypoetry\venv\lib\site-packages\poetry\installation\chooser.py:74 in choose_for
       70│
       71│             links.append(link)
       72│
       73│         if not links:
    →  74│             raise RuntimeError(f"Unable to find installation candidates for {package}")
       75│
       76│         # Get the best link
       77│         chosen = max(links, key=lambda link: self._sort_key(package, link))
       78│

Cannot install pdftopng.
```

</details>