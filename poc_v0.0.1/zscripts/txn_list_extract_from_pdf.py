"""
PayPal transactions

07/04/2024 - this script DOES NOT work
"""

import csv
import os
import re
from io import StringIO
import traceback

import pdfplumber
import pandas as pd

def paypal_validate_date_start_for_txn_str(input_string):
    """
    Validates that the input string starts with a date in the format MM/DD/YYYY.

    Parameters:
    input_string (str): The string to validate.

    Returns:
    bool: True if the string starts with a date, False otherwise.
    """
    pattern = r"^\d{2}/\d{2}/\d{4}"
    if re.match(pattern, input_string):
        return True
    else:
        return False

def paypal_parse_txn_str(input_string):
    pattern = r"(\d{2}/\d{2}/\d{4})\s+(.*?USD)\s+([-+]?\d*\.\d+|\d+)\s+([-+]?\d*\.\d+|\d+)\s+([-+]?\d*\.\d+|\d+)\s+()"
    match = re.match(pattern, input_string)
    if match:
        date = match.group(1)
        description = match.group(2)
        amount1 = float(match.group(3))
        amount2 = float(match.group(4))
        amount3 = float(match.group(5))
        return [date, description, amount1, amount2, amount3]
    else:
        return None

def extract_tables_from_pdfs(pdf_files, output_dir):
    """
    Extracts tables from a list of PDF files and saves them as CSV files.

    Parameters:
    pdf_files (list of str): List of paths to PDF files.
    output_dir (str): Directory to save the extracted tables.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for pdf_file in pdf_files:
        try:
            with open(os.path.join(output_dir, f"paypal_txn_list.csv"), "w") as f:
                csv_writer = csv.writer(f, quoting=csv.QUOTE_ALL)
                csv_writer.writerow(['DATE', 'DESCRIPTION', 'CURRENCY', 'AMOUNT', 'FEES', 'TOTAL', 'MERCHANT'])
                
                # add TXNs from every PDF
                with pdfplumber.open(pdf_file) as pdf:
                    for i, page in enumerate(pdf.pages):
                        tables = page.extract_tables()
                        """
                        Sample table scrape
                        [
                            [['Statement Period', 'PayPal Account ID'], ['Aug 1, 2022 - Aug 31,\n2022', 'Tim.Shee.8520@gmail.com']],
                            [['DATE DESCRIPTION CURRENCY AMOUNT FEES TOTAL*'], ['08/24/2022 Express Checkout Payment: ATT Prepaid USD -106.25 0.00 -106.25\nVisa x-8513 106.25\nUSD\nID: 0TH4671221285581L']]
                        ]
                        """
                        tables = tables[1:]  # skip first table
                        for table in tables:
                            for row in table[1:]:  # skip header
                                text = row[0]
                                if not paypal_validate_date_start_for_txn_str(text):
                                    continue
                                print(f"WRITING to CSV: {text}")
                                print(f"ACTUAL WRITING to CSV: {paypal_parse_txn_str(text)}")
                                csv_writer.writerow(paypal_parse_txn_str(text))
        except Exception as e:
            print(traceback.format_exc())

if __name__ == "__main__":
    pdf_files = [
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2022\paypal_statement-Aug-2022.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2022\paypal_statement-Dec-2022.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2022\paypal_statement-Mar-2022.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2022\paypal_statement-May-2022.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2022\paypal_statement-Nov-2022.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Sep-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Apr-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Dec-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Feb-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Jul-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Jun-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Mar-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-May-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2023\paypal_statement-Oct-2023.pdf",
        r"C:\Users\Timot\Documents\GitHub\expense-tracker\financial_transaction_history\statement-2024\paypal_statement-Jan-2024.pdf",
    ]
    output_dir = "output"
    extract_tables_from_pdfs(pdf_files, output_dir)
