"""
This script merges PDF files into one CSV
"""
from dataclasses import asdict, dataclass
from enum import Enum
from functools import reduce
from io import TextIOWrapper
from pathlib import Path
from typing import Any, Callable, List, Pattern
import glob
# import itertools  ## itertools.chain
import re

from pypdf import PdfReader
from loguru import logger
import pandas as pd

#=================
#   CONSTANTS
#=================
INPUT_FOLDER = Path('financial_transaction_history')
OUTPUT_FILE = Path('normalized_transactions.csv')


#=================
#   UTILS
#=================

# logging
log_format = "<green>{time:YYYY-MM-DD HH:mm:ss.SSS zz}</green> | <level>{level: <8}</level> | <yellow>Line {line: >4} ({file}):</yellow> <b>{message}</b>"
logger.add("file.log", format=log_format, colorize=False, backtrace=True, diagnose=True)

# data format utils
@dataclass
class Transaction:
    date: str
    merchant_name: str
    location: str
    price: float
    company: str
    post_date: str = ""

class Document(Enum):
    CAPITAL_ONE = "capital_one"
    CAPITAL_ONE_YEARLY_SUMMARY = "capital_one_yearly_summary_"
    CHASE = "chase"
    DISCOVER = "discover"
    FIDELITY = "fidelity"

def get_document_type(filename) -> Document:
    filename_lower = filename.lower()
    for company in Document:
        if company.value.lower() in filename_lower:
            return company
    return None

# regex utils
def clean_raw_str(value):
    return re.sub(r'[^0-9.-]', '', value)  # Remove all characters except digits, minus sign, and decimal point
def clean_replace_multiple_spaces(text):
    return re.sub(r'\s+', ' ', text) # Use a regular expression to replace multiple spaces with a single space
def find_idx_regex(regex: Pattern[str], str_list: list[str]) -> int:
    for idx, str_item in enumerate(str_list):
        if re.match(regex, str_item):
            return idx
    raise ValueError(f"Regex pattern not found in any item in list for pattern: {str(regex)}")
def split_str_regex(regex: Pattern[str], str_input: str) -> list[str]:
    parts = re.split(f'({regex})', str_input)
    parts = [part.strip() for part in parts if part]  # Filter out empty strings
    parts = [part for part in parts if part]  # Filter out space only strings
    if len(parts) > 1:
        print(parts)
        return parts
    raise ValueError(f"Regex pattern not found in text - pattern: {regex} text: {str_input}")

#=================
#   MAIN
#=================

def get_doc_parse_func(company: Document):
    def parse_capital_one_yearly(cell_list: list[str]) -> list[Transaction]:
        logger.debug("START parsing capital_one_yearly")
        headers = ['Date', 'Merchant Name', 'Merchant Location', 'Price']
        raw_tx_list_1: list[str] = cell_list[cell_list.index('Card Ending in 1496') + 1:cell_list.index('TOTAL CHARGES')]
        raw_tx_list_2: list[str] = cell_list[cell_list.index('Card Ending in 4449') + 1:cell_list.index('TOTAL CHARGES')]
        raw_tx_list = raw_tx_list_1 + raw_tx_list_2
        
        tx_list = []
        for idx in range(0, len(raw_tx_list), 4):
            logger.info(raw_tx_list[idx:idx+4])
            tx = Transaction(
                date=raw_tx_list[idx + 0],
                merchant_name=raw_tx_list[idx + 1],
                location=clean_replace_multiple_spaces(raw_tx_list[idx + 2]),
                price=float(clean_raw_str(raw_tx_list[idx + 3])),
                company=company.value
            )
            logger.info(tx)
            tx_list.append(tx)
        logger.debug(f"FINISH parsing capital_one_yearly for {len(tx_list)} transactions")
        return tx_list
    
    def parse_capital_one(cell_list: list[str]) -> list[Transaction]:
        logger.debug("START parsing capital_one")
        raw_tx_list = cell_list[cell_list.index('Trans Date Post Date Description Amount ') + 1:find_idx_regex(r'^TIMOTHY SHEE #1496: Total Transactions.*$', cell_list) - 1]
        # TODO: account for duplicates of "TIMOTHY SHEE #1496: Total Transactions"
        tx_list = []
        for raw_tx in raw_tx_list:
            # TODO: account for no spaces in raw_tx string: "Dec 11 Dec 11 MASALA BAYLITTLETONMA $116.37 "
            print(raw_tx)
            date_pattern = r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}'
            date, post_date, other_attributes_str = split_str_regex(date_pattern, raw_tx)
            print(date, post_date, other_attributes_str)
            other_attributes_str, price_str = split_str_regex(r'\$[\d.]+', other_attributes_str)
            print(other_attributes_str, price_str)
            tx = Transaction(
                date=date,
                merchant_name=other_attributes_str,
                location=other_attributes_str,
                price=float(clean_raw_str(price_str)),
                company=company.value,
                post_date=post_date,
            )
            logger.info(tx)
            tx_list.append(tx)
        logger.debug(f"FINISH parsing capital_one for {len(tx_list)} transactions")
        return tx_list
    
    document_parse_dict: dict[Document, Callable[[list[str]], list[Transaction]]] = {
        Document.CAPITAL_ONE: parse_capital_one,
        Document.CAPITAL_ONE_YEARLY_SUMMARY: parse_capital_one_yearly,
    }
    return document_parse_dict[company]


def get_doc_page_numbers(doc: Document) -> list[int]:
    doc_page_num_dict: dict[Document, list[int]] = {
        Document.CAPITAL_ONE: [3],
        Document.CAPITAL_ONE_YEARLY_SUMMARY: [9, 10],
    }
    return doc_page_num_dict[doc]


def build_transactions_table(pdf_file: TextIOWrapper) -> list[Any]:
    reader = PdfReader(pdf_file)
    doc_type = get_document_type(pdf_file)
    parse_func = get_doc_parse_func(doc_type)
    page_num_list = get_doc_page_numbers(doc_type)
    
    logger.info(f"START building transactions for {pdf_file}")
    tx_list = []
    for page_num in page_num_list:
        logger.debug(f"test: {page_num}")
        page = reader.pages[page_num - 1]  # NOTE: -1 accounts for 0 based index compared to PDF which has 1 based index
        raw_text_list = page.extract_text().split('\n')
        tx_list += parse_func(raw_text_list)
    df = pd.DataFrame([asdict(tx) for tx in tx_list])
    logger.info(f"FINISH building transactions for {pdf_file}")
    logger.debug("Transactions")
    logger.debug("\n" + str(df))
    return df


df_list: List[pd.DataFrame] = []

pdf_files = glob.glob(f'{INPUT_FOLDER}/*.pdf')
for pdf_file in pdf_files:
    try:
        # pdf_file = "financial_transaction_history/capital_one_yearly_summary_Smry_2023_1496.pdf"
        df = build_transactions_table(pdf_file)
        df_list.append(df)
    except Exception as e:
        logger.error(e)
    break
    # Append extracted transactions to the DataFrame
    # all_transactions = all_transactions.append(transactions, ignore_index=True)

# Normalize the data (cleaning, formatting, etc.)
# Example: Convert 'Date' column to datetime format
# all_transactions['Date'] = pd.to_datetime(all_transactions['Date'], errors='coerce')

df_merged = reduce(lambda left, right: pd.merge(left, right, on=['DATE'], how='outer'), df_list)
df_merged.to_csv(OUTPUT_FILE, index=False)

logger.info("FINISHED expense aggregation!")