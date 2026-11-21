import datetime

def validate_date_str(date_str: str):
    try:
        datetime.date.fromisoformat(date_str)
    except ValueError:
        return False
    return True
