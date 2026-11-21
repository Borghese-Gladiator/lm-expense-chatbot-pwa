"""
Report for Rent Applicable 

Report includes:
- Last Month
    - Transactions table (w/ Total Expenses)
    - Top Categories BAR CHART
    - Top Merchants BAR CHART
- YTD
    - Totals per Month BAR CHART - Rent Applicable + Non-Rent Applicable
    - Top Categories per Month BAR CHART
    - Top Merchants per Month BAR CHART
    - Total Expenses per Merchant TABLE
"""

import arrow
import dash
from dash import (
    dcc,
    html,
    clientside_callback,
    Input,
    Output
)
from dash.dash_table import DataTable, FormatTemplate
import dash_bootstrap_components as dbc
import pandas as pd

from utils.constants import RENT_REQUIRED
from utils.dash_utils import build_bar_chart_with_settings, build_horizontal_center_via_div, build_rent_met_button
from utils.service_utils import get_report_rent_applicable

#==================
#  CONSTANTS
#==================
last_month_name = arrow.now().shift(months=-1).format("MMMM")
curr_year_name = arrow.now().format("YYYY")

DOWNLOAD_PNG_FILENAME = f"{curr_year_name}_{last_month_name}_timmy-jon-expense-tracker"

two_decimal_format = FormatTemplate.money(2)

(
    df_last_month_txn,
    df_last_month_top_categories,
    df_last_month_top_merchants,
    df_ytd_totals_per_month,
    df_ytd_groceries_vs_restaurants_per_month,
    df_ytd_categories,
    df_ytd_top_categories,
    df_ytd_merchants,
    df_ytd_top_merchants,
) = get_report_rent_applicable()

#==================
#  UTILS
#==================
def build_columns(columns):
    return [
        {"name": col, "id": col, "type": "numeric", "format": two_decimal_format} if col == "amount" else {"name": col, "id": col}
        for col in columns
    ]

# TABLE - format amount column
df_ytd_merchants_cols = build_columns(df_ytd_merchants.columns)
df_ytd_categories_cols = build_columns(df_ytd_categories.columns)
df_last_month_txn_cols = build_columns(df_last_month_txn.columns)

# TABLE - drop problematic columns
## Transactions Table
df_last_month_txn = df_last_month_txn.drop('tags', axis=1)  # set not supported by Dash DataTable
df_last_month_txn = df_last_month_txn.drop('description', axis=1)  # blank column most of the time

## Categories Table
### df_ytd_categories = df_ytd_categories.drop('tags', axis=1)  # set not supported by Dash DataTable
### df_ytd_categories = df_ytd_categories.drop('description', axis=1)  # blank column most of the time

## Merchants Table
### df_ytd_merchants = df_ytd_merchants.drop('tags', axis=1)  # set not supported by Dash DataTable
### df_ytd_merchants = df_ytd_merchants.drop('description', axis=1)  # blank column most of the time

# GRAPH - add percentages to df
df_last_month_top_categories.loc[:, 'percent'] = df_last_month_top_categories['amount'] / df_last_month_top_categories['amount'].sum()
df_last_month_top_merchants.loc[:, 'percent'] = df_last_month_top_merchants['amount'] / df_last_month_top_merchants['amount'].sum()
df_ytd_top_categories.loc[:, 'percent'] = df_ytd_top_categories['amount'] / df_ytd_top_categories['amount'].sum()
df_ytd_top_merchants.loc[:, 'percent'] = df_ytd_top_merchants['amount'] / df_ytd_top_merchants['amount'].sum()

# BUTTON - build button based on if rent is met
last_month_rent_sum = df_last_month_txn['amount'].sum()
last_month_rent_met_component = build_rent_met_button(last_month_rent_sum <= RENT_REQUIRED)
ytd_rent_avg = df_ytd_totals_per_month['amount'].mean()
ytd_rent_met_component = build_rent_met_button(ytd_rent_avg <= RENT_REQUIRED)

# TABLE - create Actual vs Expected for YTD Totals per Month
df_ytd_totals_per_month.rename(columns={'amount': 'actual'}, inplace=True)
df_ytd_totals_per_month['expected'] = RENT_REQUIRED

# TABLE - Transactions Table - add total row
df_last_month_txn = pd.concat([
    df_last_month_txn,
    pd.DataFrame([
        [f"{last_month_name.upper()} Total", last_month_rent_sum, "", "", ""]
    ], columns=df_last_month_txn.columns)
], ignore_index=True)

# PLOTLY - create charts
chart_last_month_top_categories = build_bar_chart_with_settings(
    df=df_last_month_top_categories,
    title=f"{last_month_name} Top Categories",
    x="category",
    y="amount",
)
chart_last_month_top_merchants = build_bar_chart_with_settings(
    df=df_last_month_top_merchants,
    title=f"{last_month_name} Top Merchants",
    x="merchant",
    y="amount",
)
chart_ytd_totals_per_month = build_bar_chart_with_settings(
    df=df_ytd_totals_per_month,
    title=f"{curr_year_name} Totals per Month",
    x="date",
    y=["actual", "expected"],
    barmode="group",
)
chart_ytd_groceries_vs_restaurants_per_month = build_bar_chart_with_settings(
    df=df_ytd_groceries_vs_restaurants_per_month,
    title=f"{curr_year_name} Groceries/Restaurants per Month",
    x="date",
    y=["amount_groceries", "amount_restaurants"],
    barmode="group",
)
chart_ytd_top_categories = build_bar_chart_with_settings(
    df=df_ytd_top_categories,
    title=f"{curr_year_name} Top Categories",
    x="category",
    y="amount",
)
chart_ytd_top_merchants = build_bar_chart_with_settings(
    df=df_ytd_top_merchants,
    title=f"{curr_year_name} Top Merchants",
    x="merchant",
    y="amount",
)

#==================
#  MAIN
#==================
app = dash.Dash(
    external_stylesheets=[
        dbc.themes.BOOTSTRAP,
        dbc.icons.FONT_AWESOME,
    ],
    external_scripts=[
        {'src': 'https://cdn.jsdelivr.net/npm/dom-to-image@2.6.0/dist/dom-to-image.min.js'}
    ]
)
app.layout = html.Div(id='page', children=[
    html.H1(
        children='RENT APPLICABLE Expense Report',
        style={
            'textAlign': 'center',
        }
    ),
    dbc.Button(
        'Download PNG',
        id='download-image',
        style={
            'float': 'right',
        }
    ),
    
    html.H3(id='last-month-header', children=f"{last_month_name.upper()} Expenses"),
    html.H6(id='last-month-rent-met-text', children=[
        html.Span(children=f"{last_month_name.upper()} Total: "),
        html.Span(children=f"${last_month_rent_sum:,.2f}", style={'fontWeight': 'bold'}),
    ]),
    
    last_month_rent_met_component,
    DataTable(
        df_last_month_txn.to_dict('records'),
        df_last_month_txn_cols,
        style_table={
            'width': '100%',
            'overflowX': 'auto',
        },
        style_header_conditional=[
            {
                'if': {'column_id': 'amount'},
                'fontWeight': 'bold'
            }
        ],
        style_data_conditional=[
            {
                'if': {'column_id': 'amount'},
                'fontWeight': 'bold'
            }
        ],
        fill_width=False
    ),
    dcc.Graph(
        id='last-month-top-categories',
        figure=chart_last_month_top_categories
    ),
    dcc.Graph(
        id='last-month-top-merchants',
        figure=chart_last_month_top_merchants
    ),

    html.H3(id='ytd-header', children=f"{curr_year_name} Expenses"),
    ytd_rent_met_component,
    html.H6(id='ytd-rent-met-text', children=[
        html.Span(children=f"{curr_year_name} Average Expenses: "),
        html.Span(children=f"${ytd_rent_avg:,.2f}", style={'fontWeight': 'bold'}),
    ]),
    dcc.Graph(
        id='ytd-totals-per-month',
        figure=chart_ytd_totals_per_month
    ),
    dcc.Graph(
        id='ytd-groceries-vs-restaurants-per-month',
        figure=chart_ytd_groceries_vs_restaurants_per_month
    ),
    
    dcc.Graph(
        id='ytd-top-categories',
        figure=chart_ytd_top_categories
    ),
    build_horizontal_center_via_div(
        DataTable(
            df_ytd_categories.to_dict('records'),
            df_ytd_categories_cols,
            style_header_conditional=[
                {
                    'if': {'column_id': 'amount'},
                    'fontWeight': 'bold'
                }
            ],
            style_data_conditional=[
                {
                    'if': {'column_id': 'amount'},
                    'fontWeight': 'bold'
                }
            ],
            fill_width=False
        )
    ),

    dcc.Graph(
        id='ytd-top-merchants',
        figure=chart_ytd_top_merchants
    ),
    build_horizontal_center_via_div(
        DataTable(
            df_ytd_merchants.to_dict('records'),
            df_ytd_merchants_cols,
            style_header_conditional=[
                {
                    'if': {'column_id': 'amount'},
                    'fontWeight': 'bold'
                }
            ],
            style_data_conditional=[
                {
                    'if': {'column_id': 'amount'},
                    'fontWeight': 'bold'
                }
            ],
            fill_width=False
        ),
    )
], style={
    'marginLeft': '30px',
    'marginRight': '30px',
})


#==================
#  GENERATE PDF
#==================

# https://community.plotly.com/t/download-component-as-image-using-clientside-callback/59503
clientside_callback(
    f"""
    function(n_clicks) {{
        if(n_clicks > 0) {{
            domtoimage.toBlob(document.getElementById('page'))
                .then(function (blob) {{
                    window.saveAs(blob, '{DOWNLOAD_PNG_FILENAME}.png');
                }});
        }}
    }}
    """,
    Output('download-image', 'n_clicks'),
    Input('download-image', 'n_clicks')
)

"""
# TODO: run in prod
app = dash.Dash(__name__)
application = app.server
application.run(host='0.0.0.0', port='8080')
"""

if __name__ == '__main__':
    app.run_server(debug=True)
