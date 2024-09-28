"""Visualisation module for vinskraper."""

import pandas as pd
import plotly.io as pio
import plotly.graph_objects as go


# Colour scheme for the application.
# Used for the style of the application and the plots.
COLOUR = {
    'white': '#FFFFFF',

    'black': '#06070E',
    'blackish': '#e6e6e6',

    'red': '#8E3B46',
    'redish': '#f3ebec',
    'green': '#136F63',
    'greenish': '#F3F7F4',
}


def graph(
    df: pd.DataFrame,
) -> pd.Series:
    """
    Creates the price plot for the given data.

    Parameters
    ----------
    df : pd.DataFrame
        The data to plot.

    Returns
    -------
    pd.Series
        The plots, with the same index as `df`.
    """
    figures = []

    for _, record in df.iterrows():

        dates = pd.date_range(
            end=pd.Timestamp.now() + pd.DateOffset(months=1),
            periods=len(record['priser']) + 1,
            freq='MS',
        )

        diff = 0 if len(record['priser']) < 2 else record['priser'][-1] - record['priser'][-2]

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            name=record['navn'],

            x=dates,
            y=record['priser'] + [record['priser'][-1]],

            mode='lines+markers',
            line={
                'shape': 'hv',
                'width': 3,
                'color': COLOUR['green'] if diff < 0 else (COLOUR['red'] if diff > 0 else COLOUR['black']),
            },
            marker={
                'size': 8,
                'color': COLOUR['green'] if diff < 0 else (COLOUR['red'] if diff > 0 else COLOUR['black']),
            },

            fill='tozeroy',
            fillcolor=COLOUR['greenish'] if diff < 0 else (COLOUR['redish'] if diff > 0 else COLOUR['blackish']),
        ))

        fig.update_layout(
            plot_bgcolor=COLOUR['white'],
            height=160,
            dragmode='pan',

            margin={
                't': 20,
                'b': 0,
                'l': 0,
                'r': 0,
            },

            title={
                'text': '',
                'font': {
                    'family': 'Poppins, sans-serif',
                    'color': COLOUR['black'],
                }
            },

            xaxis={
                'range': [
                    dates[0] - pd.Timedelta(hours=5),
                    dates[-1] + pd.Timedelta(hours=5)
                ],
                'title': {
                    'text': '',
                    'font': {
                        'size': 16,
                        'weight': 'bold',
                        'family': 'Poppins, sans-serif',
                        'color': COLOUR['black'],
                    },
                },
                'tickfont': {
                    'size': 12,
                    'family': 'Poppins, sans-serif',
                    'color': COLOUR['black'],
                },
                'showgrid': False,
            },

            yaxis={
                'title': {
                    'text': '',
                    'font': {
                        'size': 16,
                        'weight': 'bold',
                        'family': 'Poppins, sans-serif',
                        'color': COLOUR['black'],
                    },
                },
                'tickfont': {
                    'size': 12,
                    'family': 'Poppins, sans-serif',
                    'color': COLOUR['black'],
                },
                'ticksuffix': ' kr',
                'tickvals': sorted(set(record['priser'])),
                'showgrid': False,
            },
        )

        figures.append(pio.to_json(fig))

    return pd.Series(figures, index=df.index)
