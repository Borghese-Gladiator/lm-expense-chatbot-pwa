from dataclasses import dataclass, fields
from dash import (
    html,
)
import pandas as pd
import plotly.express as px

#==================
#  CONSTANTS
#==================
@dataclass
class BootstrapColorMap:
    PRIMARY: str = "#0d6efd"
    SECONDARY: str = "#6c757d"
    SUCCESS: str = "#198754"
    DANGER: str = "#dc3545"
    WARNING: str = "#ffc107"
    INFO: str = "#0dcaf0"
    LIGHT: str = "#f8f9fa"
    DARK: str = "#212529"

COLOR_MAP = BootstrapColorMap()
COLOR_DISCRETE_SEQUENCE = [getattr(COLOR_MAP, field.name) for field in fields(COLOR_MAP)]
# color_discrete_sequence=["red", "green", "blue", "goldenrod", "magenta"],

success_btn_style = {
    'backgroundColor': COLOR_MAP.SUCCESS,
    'border': 'none',
    'color': 'white',
    'padding': '10px 24px',
    'textDecoration': 'none',
    'display': 'inline-block',
    'font-size': '16px',
    'margin': '4px 2px',
    'cursor': 'pointer',
    'borderRadius': '4px',
}
x_btn_style = {
    'backgroundColor': COLOR_MAP.DANGER,
    'border': 'none',
    'color': 'white',
    'padding': '10px 24px',
    'textDecoration': 'none',
    'display': 'inline-block',
    'fontSize': '16px',
    'margin': '4px 2px',
    'cursor': 'pointer',
    'borderRadius': '4px',
}

#==================
#  UTILS
#==================
def build_horizontal_center_via_div(children):
    return html.Div(
        children=children,
        style={
            'display': 'flex',
            'justifyContent': 'center',
            'alignItems': 'center'
        }
    )

def build_rent_met_button(rent_met: bool):
    if rent_met:
        return html.A(
            children=[html.I(className="fa fa-check"), " Rent Met!"],
            href="#",
            style=success_btn_style,
        )
    else:
        return html.A(
            children=[html.I(className="fa fa-times"), " Rent not met! :("],
            href="#",
            style=x_btn_style,
        )


def build_bar_chart_with_settings(df: pd.DataFrame, title: str, x: list[str], y: list[str], **kwargs) -> px.bar:
    chart = px.bar(
        df,
        title=title,
        x=x,
        y=y,
        color_discrete_sequence=COLOR_DISCRETE_SEQUENCE,
        **kwargs,
    )
    chart.update_layout(
        xaxis_title=None, yaxis_title=None
    )
    if 'percent' in df.columns:
        chart.update_traces(
            text=[f"{percent:.2%}" for percent in df['percent']],
            textposition='outside'
        )
    
    return chart