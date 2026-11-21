from datetime import datetime
from pathlib import Path

import pandas as pd

#=================
#   CONSTANTS
#=================
INPUT_FOLDER = Path('financial_transaction_history_csv')
OUTPUT_FILE = Path('transactions.csv')

HEADERS = ['Transaction Date', 'Posted Date', 'Description', 'Category', 'Amount', 'Memo', 'Rent Applicable', 'Credit Card']


#=================
#   UTILS
#=================

def convert_date_format(input_date_str: str):
    """
    Input date string in "MM/DD/YYYY" format  - "04/27/2024"
    Output date string in "YYYY-MM-DD" format - "2024-04-27"
    """
    input_date = datetime.strptime(input_date_str, "%m/%d/%Y")
    output_date_str = input_date.strftime("%Y-%m-%d")
    return output_date_str

#=================
#   MAIN
#=================

# Load Data
capital_one_1 = pd.read_csv(INPUT_FOLDER / "capital_one_2022_to_2023_transaction_download.csv")
capital_one_2 = pd.read_csv(INPUT_FOLDER / "capital_one_2023_to_2024_transaction_download.csv")
capital_one = pd.concat([capital_one_1, capital_one_2])
print(capital_one.head())

chase = pd.read_csv(INPUT_FOLDER / "chase_8397_Activity20220430_20240430_20240430.CSV")
print(chase.head())

discover = pd.read_csv(INPUT_FOLDER / "discover_AllAvailable-20240430.csv")
print(discover.head())

fidelity = pd.read_csv(INPUT_FOLDER / "fidelity_Credit Card - 8513_04-30-2021_05-04-2024.csv")
print(fidelity.head())


# Aggregate Data
res_list = []

for tx in capital_one.to_dict('records'):
    if tx['Credit'] != 'NaN':
        continue  # ignore credit
    amount = tx['Credit'] if tx['Debit'] == 'NaN' else -1 * tx['Debit']
    res_list.append({
        'Rent Applicable': False,
        'Transaction Date': tx['Transaction Date'],
        'Posted Date': tx['Posted Date'],
        'Description': tx['Description'],
        'Category': tx['Category'],
        'Amount': amount,
        'Memo': "",
        'Credit Card': "Capital One",
    })
for tx in chase.to_dict('records'):
    if tx['Amount'] > 0:
        continue  # ignore credit
    res_list.append({
        'Rent Applicable': False,
        'Transaction Date': convert_date_format(tx['Transaction Date']),
        'Posted Date': convert_date_format(tx['Post Date']),
        'Description': tx['Description'],
        'Category': tx['Category'],
        'Amount': tx['Amount'],
        'Memo': tx['Memo'],
        'Credit Card': "Chase",
    })
for tx in discover.to_dict('records'):
    if tx['Amount'] < 0:
        continue  # ignore credit
    res_list.append({
        'Rent Applicable': False,
        'Transaction Date': convert_date_format(tx['Trans. Date']),
        'Posted Date': convert_date_format(tx['Post Date']),
        'Description': tx['Description'],
        'Category': tx['Category'],
        'Amount': tx['Amount'],
        'Memo': "",
        'Credit Card': "Discover",
    })
for tx in fidelity.to_dict('records'):
    if tx['Amount'] > 0:
        continue  # ignore credit
    res_list.append({
        'Rent Applicable': False,
        'Transaction Date': tx['Date'],
        'Posted Date': "",
        'Description': tx['Name'],
        'Category': "",
        'Amount': tx['Amount'],
        'Memo': tx['Memo'],
        'Credit Card': "Fidelity",
    })
df = pd.DataFrame(res_list)

# Output aggregated data
df['Transaction Date'] = pd.to_datetime(df['Transaction Date'], format="%Y-%m-%d")
df = df.sort_values(by='Transaction Date', ascending=False)
df.rename(columns=lambda x: x.upper(), inplace=True)
df.to_csv(OUTPUT_FILE, index=False)