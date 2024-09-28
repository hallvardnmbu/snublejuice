"""Getters and setters used by the application."""

from typing import List

import pandas as pd

from database import uniques, load
from visualise import COLOUR, graph


_FEATURES = [
    'kategori', 'underkategori',
    'land', 'distrikt', 'underdistrikt',
    'volum',
    'butikk',
    'årgang', 'beskrivelse.kort', 'passer til', 'kork', 'lagring'
]
_DIVIDER = [' ', 'UTILGJENGELIGE VALG', '-------------------']
_FOCUS = None



def initialise(state):
    """
    Set the possible dropdown-values for each feature.
    Get the data for the initial selection.

    Parameters
    ----------
    state : dict
    """
    for feature, values in uniques(extract=_FEATURES).items():
        items = {
            str(k): k
            for k in sorted([v for v in values if v and v != '-'])
        }
        state['dropdown'][feature] = items
        state['dropdown']['full'][feature] = list(items.keys())

    # Convert volume to neatly formatted string.
    state['dropdown']['volum'] = {
        str(vol): f'{vol:g} cL'
        for vol in state['dropdown']['volum'].to_dict().values()
    }
    state['dropdown']['argang'] = {
        str(year): f'{year:g}'
        for year in state['dropdown']['argang'].to_dict().values()
    }

    set_data(state)


def set_data(state, fresh: bool = True):
    """
    Updates the data in the state to correspond with the current selection.

    Parameters
    ----------
    state : dict
        The current state of the application.
    fresh : bool
        Whether to reset the page number.
        Only set to False when the page number changes.
        See functions `set_{next/previous}_page`.
    """
    state['flag']['updating'] = True

    # Toggle inclusion of alcohol-free products if this category is chosen.
    if 'Alkoholfritt' in state['valgt']['kategori']:
        state['valgt']['alkoholfritt'] = ['True']

    # Removing the divider from the selection.
    state['valgt'] = {
        feature: [v for v in values if v not in _DIVIDER]
        if feature not in ('fra', 'til', 'alkohol') else values
        for feature, values in state['valgt'].to_dict().items()
    }
    focus = state['data']['fokus'] if state['data']['fokus'] else 'prisendring'

    # Loading data for the current selection.
    try:
        data, total = load(
            **state['valgt'].to_dict(),

            sorting=focus,
            ascending=len(state['data']['stigende']) > 0 if focus != 'ny' else len(state['data']['stigende']) <= 0,
            amount=state['data']['antall'],
            page=state['side']['gjeldende'],

            search=state['finn']['navn'],
            filters=state['finn']['filter'] if state['finn']['navn'] else True,

            fresh=fresh,
        )
    except KeyError:
        state['flag']['updating'] = False
        state['flag']['invalid'] = True
        state['flag']['valid'] = False
        return
    state['flag']['invalid'] = False
    state['flag']['valid'] = True

    # Remove duplicates if any.
    if data.index.duplicated().any():
        print('Found duplicates! Removing them.')
        data = data.drop_duplicates()

    # Setting the discount data for the current selection.
    _discounts(state, data)

    # Setting the total number of pages.
    if fresh:
        state['side']['totalt'] = max(total // state['data']['antall'], 1)
        state['side']['totalt'] = None if state['side']['totalt'] > 1665 else state['side']['totalt']
        state['side']['gjeldende'] = 1

    state['flag']['updating'] = False


def set_focus(state):
    global _FOCUS

    if _FOCUS == state['data']['fokus']:
        set_data(state)
        return

    state['valgt']['fra'] = None
    state['valgt']['til'] = None
    if state['data']['fokus'] not in ['navn', 'ny']:
        state['flag']['mellom'] = True
    else:
        state['flag']['mellom'] = False

    _FOCUS = state['data']['fokus']
    set_data(state)


def set_next_page(state):
    if state['side']['gjeldende'] >= 1665:
        state['side']['gjeldende'] = 1665
        return
    elif state['side']['totalt'] and state['side']['gjeldende'] >= state['side']['totalt']:
        state['side']['gjeldende'] = state['side']['totalt']
        return

    state['side']['gjeldende'] += 1

    set_data(state, fresh=False)


def set_previous_page(state):
    if state['side']['gjeldende'] < 2:
        return

    state['side']['gjeldende'] -= 1

    set_data(state, fresh=False)


def set_page_one(state):
    state['side']['gjeldende'] = 1
    set_data(state, fresh=False)


def set_page(state):
    if not state['side']['gjeldende']:
        return

    if state['side']['gjeldende'] >= 1665:
        state['side']['gjeldende'] = 1665
    elif state['side']['totalt'] and state['side']['gjeldende'] >= state['side']['totalt']:
        state['side']['gjeldende'] = state['side']['totalt']

    set_data(state, fresh=False)


def _dropdown(
    state,
    feature: str,
    omit: List[str] = [],
    include_all: bool = False
):

    # Get the possible values for the current selection.
    # Omitting the current feature and the ones in the omit list.
    possible = uniques(
        extract=[feature],
        **{k: v for k, v in state['valgt'].to_dict().items()
            if k not in (omit + [feature])},
    )[feature]

    # Get the values that are not possible.
    others = (set(state['dropdown']['full'][feature]) - set(possible)) if include_all else []

    # Toggle flag if possible values, and a flag exists.
    if feature in state['flag'] and possible:
        state['flag'][feature] = True
    elif feature in state['flag']:
        state['flag'][feature] = False
        return

    # Update the dropdown for the current feature.
    # Including impossible values if `include_all` is `True`.
    state['dropdown'][feature] = {
        str(cat): cat if feature not in ('volum', 'argang') else (f'{float(cat):g}' + (' cL' if feature == 'volum' else '') if cat not in _DIVIDER else cat)
        for cat in sorted(possible)
        + (_DIVIDER if others else [])
        + sorted(others, key=lambda x: x if feature != 'volum' else float(x))
    }

    # Remove already selected values if they are not in the possible's list.
    for choice in [float(c) if feature == 'volum' else c for c in state['valgt'][feature]]:
        if choice not in possible:
            state['valgt'][feature].remove(choice)


def set_store(state):

    if state['valgt']['butikk']:
        state['flag']['butikk'] = True
    else:
        state['flag']['butikk'] = False

    set_category(state, main=False)
    set_country(state, main=False)
    set_volume(state, main=False)
    set_data(state)


def set_category(state, main: bool = True):

    # Toggle possibility of selecting subcategory if category is selected.
    # Update the possible dropdown for the subcategory otherwise.
    if not state['valgt']['kategori']:
        state['flag']['underkategori'] = False
        state['valgt']['underkategori'] = []
    else:
        _dropdown(state, 'underkategori')

    # Cascade downwards.
    set_subcategory(state, main=main)


def set_subcategory(state, main: bool = True):

    if not main:
        return

    _dropdown(state, 'land', omit=['distrikt', 'underdistrikt'], include_all=True)
    _dropdown(state, 'volum', include_all=True)

    set_country(state, main=False)
    set_volume(state, main=False)

    set_data(state)


def set_country(state, main: bool = True):

    # _dropdown(state, 'land', omit=['distrikt', 'underdistrikt'], include_all=True)

    # Toggle possibility of selecting district if a country is selected.
    # Update the possible dropdown for the district otherwise.
    if not state['valgt']['land']:
        state['flag']['distrikt'] = False
        state['flag']['underdistrikt'] = False
        state['valgt']['distrikt'] = []
        state['valgt']['underdistrikt'] = []
    else:
        _dropdown(state, 'distrikt', omit=['underdistrikt'])

    # Cascade downwards.
    set_district(state, main=main)


def set_district(state, main: bool = True):

    # Toggle possibility of selecting subdistrict if a district is selected.
    # Update the possible dropdown for the subdistrict otherwise.
    if not state['valgt']['distrikt']:
        state['flag']['underdistrikt'] = False
        state['valgt']['underdistrikt'] = []
    else:
        _dropdown(state, 'underdistrikt')

    # Cascade downwards.
    set_subdistrict(state, main=main)


def set_subdistrict(state, main: bool = True):

    if not main:
        return

    _dropdown(state, 'kategori', omit=['underkategori'], include_all=True)
    _dropdown(state, 'volum', include_all=True)

    set_category(state, main=False)
    set_volume(state, main=False)

    set_data(state)


def set_volume(state, main: bool = True):

    if not main:
        return

    _dropdown(state, 'kategori', omit=['underkategori'], include_all=True)
    _dropdown(state, 'land', omit=['distrikt', 'underdistrikt'], include_all=True)

    set_category(state, main=False)
    set_country(state, main=False)

    set_data(state)


def reset_selection(state):
    """
    Resets the current selection.

    Parameters
    ----------
    state : dict
        The current state of the application.
    """
    for feature in state['valgt'].to_dict():
        state['valgt'][feature] = [] if feature not in ('fra', 'til', 'alkohol') else None

    # Reset the dropdown.
    # Arbitrarily chosen, as all `set_{selection}` functions cascade downwards.
    _dropdown(state, 'kategori')
    set_category(state)


def _discounts(state, data: pd.DataFrame):
    """
    Updates the discount data in the state to correspond with the current selection.

    Parameters
    ----------
    state : dict
        The current state of the application.
    data : pd.DataFrame
        The currently selected data.
    """
    data['plot'] = graph(data)

    data['prisendring'] = data['prisendring'].apply(lambda x: int(x) if x else 0)
    data['literpris'] = data['literpris'].apply(lambda x: round(x, 2) if x else 0)
    data['alkoholpris'] = data['alkoholpris'].apply(lambda x: round(x, 2) if x else 0)
    data['volum'] = data['volum'].apply(lambda x: round(x, 2) if x else 0)
    data['alkohol'] = data['alkohol'].apply(lambda x: x if x else 0)

    data['bakgrunnsfarge'] = data['prisendring'].apply(lambda x: COLOUR['greenish'] if x < 0 else (COLOUR['redish'] if x > 0 else COLOUR['blackish']))
    data['tekstfarge'] = data['prisendring'].apply(lambda x: COLOUR['green'] if x < 0 else (COLOUR['red'] if x > 0 else COLOUR['black']))

    # Rename columns with spaces to underscores, and å -> a.
    data.columns = [col.replace(' ', '_').replace('å', 'a')
                    for col in data.columns]

    state['data']['verdier'] = {
        str(k): v
        for k, v in data.reset_index().T.to_dict().items()
    }
