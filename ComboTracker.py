import os
import sys
import json
import time
import colorsys
import configparser
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk

try:
    import XInput
    XINPUT_AVAILABLE = True
except ImportError:
    XINPUT_AVAILABLE = False

def get_base_dir():
    """Gets the absolute path to the app's root directory, whether running as a script or a compiled .exe"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

# --- CONSTANTS ---
BASE_ATTACKS = {'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3'}
HOLD_ATTACKS = {f"h_{a}" for a in BASE_ATTACKS}
ATTACKS = BASE_ATTACKS.union(HOLD_ATTACKS)

CARDINALS = {'up', 'down', 'left', 'right', 'upright', 'upleft', 'downright', 'downleft'}
CHARGE_DIRS = {f"c_{d}" for d in CARDINALS}

DIRECTIONS = CARDINALS.union(CHARGE_DIRS).union({
    'qcb', 'qcf', 'hcb', 'hcf', '360', 'dp', 'rdp'
})

SYMBOLS = {'plus', 'newline', 'goes_into'}

TEXT_MAP = {
    'lp': 'LP', 'mp': 'MP', 'hp': 'HP', 'lk': 'LK', 'mk': 'MK', 'hk': 'HK',
    'any_p': 'Any P', 'any_k': 'Any K', 'start': 'START', 'select': 'SELECT', 'l3': 'L3', 'r3': 'R3',
    'up': '↑', 'down': '↓', 'left': '←', 'right': '→',
    'upright': '↗', 'upleft': '↖', 'downright': '↘', 'downleft': '↙',
    'c_up': '[C]↑', 'c_down': '[C]↓', 'c_left': '[C]←', 'c_right': '[C]→',
    'c_upright': '[C]↗', 'c_upleft': '[C]↖', 'c_downright': '[C]↘', 'c_downleft': '[C]↙',
    'h_lp': '[H]LP', 'h_mp': '[H]MP', 'h_hp': '[H]HP', 'h_lk': '[H]LK', 'h_mk': '[H]MK', 'h_hk': '[H]HK',
    'h_any_p': '[H]Any P', 'h_any_k': '[H]Any K',
    'goes_into': ' ➔ ', 'plus': '+', 'newline': '↵',
    'qcb': 'QCB', 'qcf': 'QCF', 'hcb': 'HCB', 'hcf': 'HCF', '360': '360',
    'dp': 'DP', 'rdp': 'RDP'
}

GLYPH_SUFFIXES = {
    "Default": ("","PDR, mp+mk+right right", "DRC, mp+mk",), "Classic": ("_CL",), "SuperCombo": ("_SU",),
    "EventHubs": ("_HU",), "Notation": ("_np",), "JP Notation": ("_jp",),
    "Nintendo": ("_NT","PDR, mp+mk+right right", "DRC, mp+mk",),
    "PlayStation": ("_PS","PDR, mp+mk+right right", "DRC, mp+mk",),
    "Xbox": ("_XB","PDR, mp+mk+right right", "DRC, mp+mk",),
    "PC": ("_KB","PDR, mp+mk+right right", "DRC, mp+mk",),
    "Modern": ("_MD","PDR, mp+mk+right right", "DRC, mp+mk",),
    "EX Plus a": ("_EX",), "Tekken": ("_TK","EWGF, right 360 down downright mp","RA, downright hk",),
    "Tekken 3": ("_T3","EWGF, right 360 down downright mp",), "Soul Calibur": ("_SC",),
    "Guilty Gear": ("_GG",), "BlazBlue": ("_BB",), "Persona 4": ("_P4",), "FighterZ": ("_FZ",),
    "SNK": ("_SK",), "UMK3": ("_M3",), "Arcade": ("_RT",), "N64": ("_64",),
    "GameCube": ("_GC",), "Saturn": ("_GE",), "Dreamcast": ("_DC",),
}

MACRO_TOOLTIPS = {
    "PDR": "Parry Drive Rush", "DRC": "Drive Rush Cancel", "QCB": "Quarter circle back (214)",
    "QCF": "Quarter circle forward (236)", "HCB": "Half Circle Back (63214)", "HCF": "Half Circle Forward (41236)",
    "RDP": "Reverse Dragon Punch (421)", "FDP": "Forward Dragon Punch (23)", "EWGF": "Electric Wind God Fist",
    "EQGF": "Electric Wind God Fist", "RA": "Rage Art"
}

# --- DYNAMIC LAYOUT GENERATOR ---
def install_default_layouts(dest_dir):
    marker = os.path.join(dest_dir, ".installed")
    if os.path.exists(marker): return

    default_layouts = {}
    
    arcade_styles = {
        "Capcom SF2": {"top": [(0, 10), (35, 10), (70, 10), (105, 10)], "bot": [(0, 45), (35, 45), (70, 45), (105, 45)]},
        "Vewlix": {"top": [(8, 8), (46, -8), (86, -8), (126, -8)], "bot": [(0, 50), (38, 35), (78, 35), (118, 35)]},
        "Sega2P": {"top": [(0, 9), (33, -12), (72, -12), (110, -4)], "bot": [(0, 50), (33, 30), (71, 30), (110, 40)]},
        "Namco Noir": {"top": [(4, 7), (42, -8), (86, -12), (125, -4)], "bot": [(0, 50), (35, 35), (72, 40), (102, 46)]},
        "IST": {"top": [(-7, 8), (27, -11), (65, -22), (104, -26)], "bot": [(1, 47), (35, 26), (72, 17), (110, 12)]},
    }

    tokens_p, ids_p = ["lp", "mp", "hp", "any_p"], ["X", "Y", "RIGHT_SHOULDER", "LEFT_SHOULDER"]
    tokens_k, ids_k = ["lk", "mk", "hk", "any_k"], ["A", "B", "RT", "LT"]

    for name, rows in arcade_styles.items():
        for num_btns in [6, 8]:
            layout = [{"id": "joystick", "type": "stick", "x": 55, "y": 85, "size": 30}]
            base_x, base_y = 135, 60
            for i in range(num_btns // 2):
                layout.append({"id": ids_p[i], "type": "glyph", "token": tokens_p[i], "x": base_x + rows["top"][i][0], "y": base_y + rows["top"][i][1], "size": 16})
                layout.append({"id": ids_k[i], "type": "glyph", "token": tokens_k[i], "x": base_x + rows["bot"][i][0], "y": base_y + rows["bot"][i][1], "size": 16})
            default_layouts[f"Arcade - {name} {num_btns}"] = layout

    default_layouts["Arcade - MVS"] = [
        {"id": "joystick", "type": "stick", "x": 55, "y": 85, "size": 30},
        {"id": "X", "type": "glyph", "token": "lp", "x": 115, "y": 90, "size": 16},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 150, "y": 70, "size": 16},
        {"id": "RIGHT_SHOULDER", "type": "glyph", "token": "lk", "x": 185, "y": 60, "size": 16},
        {"id": "LEFT_SHOULDER", "type": "glyph", "token": "mk", "x": 220, "y": 70, "size": 16}
    ]

    leverless = [
        {"id": "DPAD_LEFT", "type": "glyph", "token": "left", "x": 50, "y": 80, "size": 14},
        {"id": "DPAD_DOWN", "type": "glyph", "token": "down", "x": 80, "y": 68, "size": 14},
        {"id": "DPAD_RIGHT", "type": "glyph", "token": "right", "x": 110, "y": 80, "size": 14},
        {"id": "DPAD_UP", "type": "glyph", "token": "up", "x": 85, "y": 120, "size": 18}
    ]
    base_x, base_y = 150, 55
    for i in range(4):
        leverless.append({"id": ids_p[i], "type": "glyph", "token": tokens_p[i], "x": base_x + arcade_styles["Sega2P"]["top"][i][0], "y": base_y + arcade_styles["Sega2P"]["top"][i][1], "size": 14})
        leverless.append({"id": ids_k[i], "type": "glyph", "token": tokens_k[i], "x": base_x + arcade_styles["Sega2P"]["bot"][i][0], "y": base_y + arcade_styles["Sega2P"]["bot"][i][1], "size": 14})
    default_layouts["Leverless"] = leverless

    default_layouts["NES"] = [
        {"id": "DPAD_UP", "type": "rect", "x": 35, "y": 45, "w": 14, "h": 16},
        {"id": "DPAD_DOWN", "type": "rect", "x": 35, "y": 75, "w": 14, "h": 16},
        {"id": "DPAD_LEFT", "type": "rect", "x": 19, "y": 61, "w": 16, "h": 14},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 49, "y": 61, "w": 16, "h": 14},
        {"id": "BACK", "type": "rect", "x": 86, "y": 77, "w": 18, "h": 6},
        {"id": "START", "type": "rect", "x": 116, "y": 77, "w": 18, "h": 6},
        {"id": "X", "type": "glyph", "token": "lp", "x": 168, "y": 79, "size": 12},
        {"id": "A", "type": "glyph", "token": "lk", "x": 199, "y": 79, "size": 12}
    ]

    default_layouts["SNES"] = [
        {"id": "LEFT_SHOULDER", "type": "rect", "token": "any_p", "x": 30, "y": 20, "w": 40, "h": 10},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "hp", "x": 150, "y": 20, "w": 40, "h": 10},
        {"id": "DPAD_UP", "type": "rect", "x": 44, "y": 57, "w": 14, "h": 16},
        {"id": "DPAD_DOWN", "type": "rect", "x": 44, "y": 87, "w": 14, "h": 16},
        {"id": "DPAD_LEFT", "type": "rect", "x": 28, "y": 73, "w": 16, "h": 14},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 58, "y": 73, "w": 16, "h": 14},
        {"id": "BACK", "type": "rect", "x": 87, "y": 80, "w": 12, "h": 6},
        {"id": "START", "type": "rect", "x": 112, "y": 80, "w": 12, "h": 6},
        {"id": "X", "type": "glyph", "token": "lp", "x": 152, "y": 80, "size": 8},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 172, "y": 64, "size": 8},
        {"id": "A", "type": "glyph", "token": "lk", "x": 172, "y": 95, "size": 8},
        {"id": "B", "type": "glyph", "token": "mk", "x": 192, "y": 80, "size": 8}
    ]

    default_layouts["Genesis (3-Btn)"] = [
        {"id": "DPAD_UP", "type": "rect", "x": 45, "y": 55, "w": 14, "h": 16},
        {"id": "DPAD_DOWN", "type": "rect", "x": 45, "y": 85, "w": 14, "h": 16},
        {"id": "DPAD_LEFT", "type": "rect", "x": 29, "y": 71, "w": 16, "h": 14},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 59, "y": 71, "w": 16, "h": 14},
        {"id": "START", "type": "rect", "x": 100, "y": 75, "w": 14, "h": 8},
        {"id": "X", "type": "glyph", "token": "lp", "x": 140, "y": 85, "size": 14},
        {"id": "A", "type": "glyph", "token": "lk", "x": 175, "y": 75, "size": 14},
        {"id": "B", "type": "glyph", "token": "mk", "x": 210, "y": 70, "size": 14}
    ]

    default_layouts["Genesis (6-Btn)"] = [
        {"id": "DPAD_UP", "type": "rect", "x": 45, "y": 55, "w": 14, "h": 16},
        {"id": "DPAD_DOWN", "type": "rect", "x": 45, "y": 85, "w": 14, "h": 16},
        {"id": "DPAD_LEFT", "type": "rect", "x": 29, "y": 71, "w": 16, "h": 14},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 59, "y": 71, "w": 16, "h": 14},
        {"id": "START", "type": "rect", "x": 100, "y": 75, "w": 14, "h": 8},
        {"id": "X", "type": "glyph", "token": "lp", "x": 140, "y": 60, "size": 12},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 175, "y": 50, "size": 12},
        {"id": "RIGHT_SHOULDER", "type": "glyph", "token": "hp", "x": 210, "y": 55, "size": 12},
        {"id": "A", "type": "glyph", "token": "lk", "x": 135, "y": 90, "size": 14},
        {"id": "B", "type": "glyph", "token": "mk", "x": 170, "y": 80, "size": 14},
        {"id": "RT", "type": "glyph", "token": "hk", "x": 205, "y": 85, "size": 14}
    ]

    default_layouts["N64"] = [
        {"id": "LEFT_SHOULDER", "type": "rect", "x": 30, "y": 20, "w": 35, "h": 10},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "any_p", "x": 155, "y": 20, "w": 35, "h": 10},
        {"id": "RT", "type": "rect", "token": "any_k", "x": 95, "y": 40, "w": 30, "h": 15},
        {"id": "DPAD_UP", "type": "rect", "x": 35, "y": 55, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 35, "y": 83, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 21, "y": 69, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 47, "y": 69, "w": 14, "h": 12},
        {"id": "LEFT_THUMB", "type": "stick", "x": 110, "y": 120, "size": 16},
        {"id": "START", "type": "circle", "x": 110, "y": 65, "size": 6},
        {"id": "X", "type": "glyph", "token": "lp", "x": 155, "y": 80, "size": 12},
        {"id": "A", "type": "glyph", "token": "lk", "x": 175, "y": 95, "size": 12},
        {"id": "R_STICK_UP", "type": "glyph", "token": "hp", "x": 200, "y": 50, "size": 8},
        {"id": "R_STICK_DOWN", "type": "glyph", "token": "mk", "x": 200, "y": 80, "size": 8},
        {"id": "R_STICK_LEFT", "type":  "glyph", "token": "mp", "x": 185, "y": 65, "size": 8},
        {"id": "R_STICK_RIGHT", "type": "glyph", "token": "hk",  "x": 215, "y": 65, "size": 8}
    ]

    default_layouts["GameCube"] = [
        {"id": "LEFT_SHOULDER", "type": "rect", "token": "any_p", "x": 30, "y": 20, "w": 35, "h": 10},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "hp", "x": 182, "y": 20, "w": 35, "h": 10},
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 5, "w": 35, "h": 12},
        {"id": "RT", "type": "rect", "token": "hk", "x": 182, "y": 5, "w": 35, "h": 12},
        {"id": "LEFT_THUMB", "type": "stick", "x": 54, "y": 98, "size": 16},
        {"id": "DPAD_UP", "type": "rect", "x": 80, "y": 130, "w": 10, "h": 12},
        {"id": "DPAD_DOWN", "type": "rect", "x": 80, "y": 154, "w": 10, "h": 12},
        {"id": "DPAD_LEFT", "type": "rect", "x": 68, "y": 142, "w": 12, "h": 10},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 91, "y": 142, "w": 12, "h": 10},
        {"id": "START", "type": "circle", "x": 123, "y": 98, "size": 6},
        {"id": "A", "type": "glyph", "token": "lk", "x": 190, "y": 98, "size": 12},
        {"id": "X", "type": "glyph", "token": "lp", "x": 166, "y": 112, "size": 8},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 183.3, "y": 74, "size": 10},
        {"id": "B", "type": "glyph", "token": "mk", "x": 214, "y": 93, "size": 10},
        {"id": "RIGHT_THUMB", "type": "stick", "x": 159, "y": 148, "size": 16}
    ]

    default_layouts["PlayStation 1"] = [
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 10, "w": 35, "h": 10},
        {"id": "LEFT_SHOULDER", "type": "rect", "token": "any_p", "x": 30, "y": 25, "w": 35, "h": 8},
        {"id": "RT", "type": "rect", "token": "hk", "x": 155, "y": 10, "w": 35, "h": 10},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "hp", "x": 155, "y": 30, "w": 35, "h": 8},
        {"id": "DPAD_UP", "type": "rect", "x": 55, "y": 65, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 55, "y": 93, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 41, "y": 79, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 67, "y": 79, "w": 14, "h": 12},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 170, "y": 65, "size": 13},
        {"id": "X", "type": "glyph", "token": "lp", "x": 145, "y": 85, "size": 13},
        {"id": "B", "type": "glyph", "token": "mk", "x": 195, "y": 85, "size": 13},
        {"id": "A", "type": "glyph", "token": "lk", "x": 170, "y": 105, "size": 13},
        {"id": "BACK", "type": "rect", "x": 95, "y": 85, "w": 10, "h": 5},
        {"id": "START", "type": "rect", "x": 115, "y": 85, "w": 10, "h": 5}
    ]

    default_layouts["PlayStation 5"] = [
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 10, "w": 35, "h": 15},
        {"id": "LEFT_SHOULDER", "type": "rect", "token": "any_p", "x": 30, "y": 30, "w": 35, "h": 10},
        {"id": "RT", "type": "rect", "token": "hk", "x": 155, "y": 10, "w": 35, "h": 15},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "hp", "x": 155, "y": 30, "w": 35, "h": 10},
        {"id": "DPAD_UP", "type": "rect", "x": 55, "y": 60, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 55, "y": 88, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 41, "y": 74, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 67, "y": 74, "w": 14, "h": 12},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 170, "y": 60, "size": 12},
        {"id": "X", "type": "glyph", "token": "lp", "x": 145, "y": 80, "size": 12},
        {"id": "B", "type": "glyph", "token": "mk", "x": 195, "y": 80, "size": 12},
        {"id": "A", "type": "glyph", "token": "lk", "x": 170, "y": 100, "size": 12},
        {"id": "BACK", "type": "rect", "x": 90, "y": 60, "w": 8, "h": 14},
        {"id": "START", "type": "rect", "x": 122, "y": 60, "w": 8, "h": 14},
        {"id": "TOUCHPAD", "type": "rect", "x": 80, "y": 45, "w": 60, "h": 35},
        {"id": "LEFT_THUMB", "type": "stick", "x": 85, "y": 115, "size": 14},
        {"id": "RIGHT_THUMB", "type": "stick", "x": 135, "y": 115, "size": 14}
    ]

    default_layouts["Xbox (OG)"] = [
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 10, "w": 35, "h": 15},
        {"id": "RT", "type": "rect", "token": "hk", "x": 155, "y": 10, "w": 35, "h": 15},
        {"id": "LEFT_THUMB", "type": "stick", "x": 55, "y": 60, "size": 16},
        {"id": "DPAD_UP", "type": "rect", "x": 80, "y": 100, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 80, "y": 128, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 66, "y": 114, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 92, "y": 114, "w": 14, "h": 12},
        {"id": "BACK", "type": "circle", "x": 105, "y": 70, "size": 6},
        {"id": "START", "type": "circle", "x": 120, "y": 70, "size": 6},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 165, "y": 60, "size": 12},
        {"id": "X", "type": "glyph", "token": "lp", "x": 145, "y": 75, "size": 12},
        {"id": "B", "type": "glyph", "token": "mk", "x": 185, "y": 75, "size": 12},
        {"id": "A", "type": "glyph", "token": "lk", "x": 165, "y": 90, "size": 12},
        {"id": "RIGHT_SHOULDER", "type": "circle", "token": "hp", "x": 185, "y": 45, "size": 8},
        {"id": "LEFT_SHOULDER", "type": "circle", "token": "any_p", "x": 165, "y": 40, "size": 8},
        {"id": "RIGHT_THUMB", "type": "stick", "x": 135, "y": 115, "size": 16}
    ]

    default_layouts["Xbox One"] = [
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 10, "w": 35, "h": 15},
        {"id": "LEFT_SHOULDER", "type": "rect", "token": "any_p", "x": 30, "y": 30, "w": 35, "h": 10},
        {"id": "RT", "type": "rect", "token": "hk", "x": 155, "y": 10, "w": 35, "h": 15},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "hp", "x": 155, "y": 30, "w": 35, "h": 10},
        {"id": "LEFT_THUMB", "type": "stick", "x": 55, "y": 65, "size": 14},
        {"id": "DPAD_UP", "type": "rect", "x": 85, "y": 95, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 85, "y": 123, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 71, "y": 109, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 97, "y": 109, "w": 14, "h": 12},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 170, "y": 60, "size": 12},
        {"id": "X", "type": "glyph", "token": "lp", "x": 145, "y": 80, "size": 12},
        {"id": "B", "type": "glyph", "token": "mk", "x": 195, "y": 80, "size": 12},
        {"id": "A", "type": "glyph", "token": "lk", "x": 170, "y": 100, "size": 12},
        {"id": "BACK", "type": "circle", "x": 100, "y": 65, "size": 6},
        {"id": "START", "type": "circle", "x": 120, "y": 65, "size": 6},
        {"id": "RIGHT_THUMB", "type": "stick", "x": 140, "y": 120, "size": 14}
    ]

    default_layouts["WiiU Pro Controller"] = [
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 10, "w": 35, "h": 15},
        {"id": "LEFT_SHOULDER", "type": "rect", "token": "any_p", "x": 30, "y": 30, "w": 35, "h": 10},
        {"id": "RT", "type": "rect", "token": "hk", "x": 155, "y": 10, "w": 35, "h": 15},
        {"id": "RIGHT_SHOULDER", "type": "rect", "token": "hp", "x": 155, "y": 30, "w": 35, "h": 10},
        {"id": "LEFT_THUMB", "type": "stick", "x": 55, "y": 65, "size": 14},
        {"id": "RIGHT_THUMB", "type": "stick", "x": 165, "y": 65, "size": 14},
        {"id": "DPAD_UP", "type": "rect", "x": 55, "y": 100, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 55, "y": 128, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 41, "y": 114, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 67, "y": 114, "w": 14, "h": 12},
        {"id": "X", "type": "glyph", "token": "mp", "x": 165, "y": 100, "size": 12},
        {"id": "Y", "type": "glyph", "token": "lp", "x": 140, "y": 120, "size": 12},
        {"id": "A", "type": "glyph", "token": "hk", "x": 190, "y": 120, "size": 12},
        {"id": "B", "type": "glyph", "token": "lk", "x": 165, "y": 140, "size": 12},
        {"id": "BACK", "type": "circle", "x": 100, "y": 65, "size": 6},
        {"id": "START", "type": "circle", "x": 120, "y": 65, "size": 6}
    ]

    default_layouts["Dreamcast"] = [
        {"id": "LT", "type": "rect", "token": "any_k", "x": 30, "y": 10, "w": 35, "h": 15},
        {"id": "RT", "type": "rect", "token": "hk", "x": 155, "y": 10, "w": 35, "h": 15},
        {"id": "LEFT_THUMB", "type": "stick", "x": 55, "y": 55, "size": 16},
        {"id": "DPAD_UP", "type": "rect", "x": 55, "y": 95, "w": 12, "h": 14},
        {"id": "DPAD_DOWN", "type": "rect", "x": 55, "y": 123, "w": 12, "h": 14},
        {"id": "DPAD_LEFT", "type": "rect", "x": 41, "y": 109, "w": 14, "h": 12},
        {"id": "DPAD_RIGHT", "type": "rect", "x": 67, "y": 109, "w": 14, "h": 12},
        {"id": "START", "type": "circle", "x": 110, "y": 100, "size": 8},
        {"id": "Y", "type": "glyph", "token": "mp", "x": 165, "y": 50, "size": 14},
        {"id": "X", "type": "glyph", "token": "lp", "x": 135, "y": 70, "size": 14},
        {"id": "B", "type": "glyph", "token": "mk", "x": 195, "y": 70, "size": 14},
        {"id": "A", "type": "glyph", "token": "lk", "x": 165, "y": 90, "size": 14}
    ]

    for name, elements in default_layouts.items():
        if name.startswith("Arcade") or name in ["Leverless"]:
            sub_dir = os.path.join(dest_dir, "Arcade")
        else:
            sub_dir = os.path.join(dest_dir, "Gamepad")
            
        os.makedirs(sub_dir, exist_ok=True)
        filepath = os.path.join(sub_dir, f"{name}.json")
        
        layout_data = {
            "name": name,
            "bg_image": "",
            "elements": elements
        }
        try:
            with open(filepath, 'w') as f:
                json.dump(layout_data, f, indent=4)
        except Exception:
            pass
            
    with open(marker, 'w') as f:
        f.write("Defaults installed.")

class ToolTip:
    def __init__(self, widget, text, delay=2000):
        self.widget = widget
        self.text = text
        self.delay = delay
        self.timer = None
        self.top = None
        self.x = 0
        self.y = 0
        self.widget.bind("<Enter>", self.schedule, add="+")
        self.widget.bind("<Leave>", self.unschedule, add="+")
        self.widget.bind("<ButtonPress>", self.unschedule, add="+")
        self.widget.bind("<Motion>", self.update_coords, add="+")

    def update_coords(self, event):
        self.x = event.x_root
        self.y = event.y_root

    def schedule(self, event=None):
        self.unschedule()
        if event:
            self.x = event.x_root
            self.y = event.y_root
        self.timer = self.widget.after(self.delay, self.show_tip)

    def unschedule(self, event=None):
        if self.timer:
            self.widget.after_cancel(self.timer)
            self.timer = None
        if self.top:
            self.top.destroy()
            self.top = None

    def show_tip(self):
        if self.top:
            return
        x = self.x + 15
        y = self.y + 20
        self.top = tk.Toplevel(self.widget)
        self.top.wm_overrideredirect(True)
        self.top.attributes("-topmost", True)
        
        label = tk.Label(self.top, text=self.text, justify='left',
                         background="#2A2A2A", foreground="#FFFFFF", 
                         relief="solid", borderwidth=1, font=("Arial", 9))
        label.pack(ipadx=4, ipady=2)
        self.top.geometry(f"+{x}+{y}")

class CustomColorPicker(tk.Toplevel):
    def __init__(self, parent, initial_color="#000000"):
        super().__init__(parent)
        self.title("Select Color")
        self.geometry("320x350")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.result = initial_color
        self._updating = False

        try:
            r = int(initial_color[1:3], 16)
            g = int(initial_color[3:5], 16)
            b = int(initial_color[5:7], 16)
        except:
            r, g, b = 0, 0, 0
            initial_color = "#000000"

        h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)

        self.r_var = tk.IntVar(value=r)
        self.g_var = tk.IntVar(value=g)
        self.b_var = tk.IntVar(value=b)
        
        self.h_var = tk.IntVar(value=int(h * 360))
        self.s_var = tk.IntVar(value=int(s * 100))
        self.v_var = tk.IntVar(value=int(v * 100))

        self.r_var.trace_add("write", self.on_rgb_change)
        self.g_var.trace_add("write", self.on_rgb_change)
        self.b_var.trace_add("write", self.on_rgb_change)
        
        self.h_var.trace_add("write", self.on_hsv_change)
        self.s_var.trace_add("write", self.on_hsv_change)
        self.v_var.trace_add("write", self.on_hsv_change)

        main_f = tk.Frame(self, padx=10, pady=10)
        main_f.pack(fill="both", expand=True)

        self.preview = tk.Canvas(main_f, height=50, bg=initial_color, relief="solid", borderwidth=1)
        self.preview.pack(fill="x", pady=(0, 10))

        rgb_f = tk.LabelFrame(main_f, text=" RGB ")
        rgb_f.pack(fill="x", pady=5)
        self._make_slider(rgb_f, "R", self.r_var, 255)
        self._make_slider(rgb_f, "G", self.g_var, 255)
        self._make_slider(rgb_f, "B", self.b_var, 255)

        hsv_f = tk.LabelFrame(main_f, text=" HSV ")
        hsv_f.pack(fill="x", pady=5)
        self._make_slider(hsv_f, "H", self.h_var, 360)
        self._make_slider(hsv_f, "S", self.h_var, 100, var=self.s_var)
        self._make_slider(hsv_f, "V", self.h_var, 100, var=self.v_var)

        btn_f = tk.Frame(main_f)
        btn_f.pack(fill="x", pady=10)
        tk.Button(btn_f, text="Confirm", width=12, command=self.confirm).pack(side="right")
        tk.Button(btn_f, text="Cancel", width=12, command=self.destroy).pack(side="right", padx=5)

    def _make_slider(self, parent, label, dummy_var, max_val, var=None):
        target_var = var if var else dummy_var
        f = tk.Frame(parent)
        f.pack(fill="x", padx=5, pady=2)
        tk.Label(f, text=label, width=2, anchor="w").pack(side="left")
        tk.Scale(f, from_=0, to=max_val, orient="horizontal", variable=target_var, showvalue=False).pack(side="left", fill="x", expand=True, padx=5)
        tk.Entry(f, textvariable=target_var, width=4, justify="center").pack(side="left")

    def on_rgb_change(self, *args):
        if self._updating: return
        self._updating = True
        try:
            r, g, b = self.r_var.get(), self.g_var.get(), self.b_var.get()
            r = max(0, min(255, r))
            g = max(0, min(255, g))
            b = max(0, min(255, b))
            h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
            self.h_var.set(int(h * 360))
            self.s_var.set(int(s * 100))
            self.v_var.set(int(v * 100))
            self.update_preview(r, g, b)
        except tk.TclError: pass
        self._updating = False

    def on_hsv_change(self, *args):
        if self._updating: return
        self._updating = True
        try:
            h, s, v = self.h_var.get(), self.s_var.get(), self.v_var.get()
            h = max(0, min(360, h))
            s = max(0, min(100, s))
            v = max(0, min(100, v))
            r, g, b = colorsys.hsv_to_rgb(h/360.0, s/100.0, v/100.0)
            r_int, g_int, b_int = int(r * 255), int(g * 255), int(b * 255)
            self.r_var.set(r_int)
            self.g_var.set(g_int)
            self.b_var.set(b_int)
            self.update_preview(r_int, g_int, b_int)
        except tk.TclError: pass
        self._updating = False

    def update_preview(self, r, g, b):
        hex_col = "#{:02x}{:02x}{:02x}".format(r, g, b)
        self.preview.config(bg=hex_col)

    def confirm(self):
        r, g, b = self.r_var.get(), self.g_var.get(), self.b_var.get()
        self.result = "#{:02x}{:02x}{:02x}".format(max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
        self.destroy()

class GlyphBuilderWindow(tk.Toplevel):
    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.title("Custom Glyph Builder")
        self.geometry("950x450")
        self.resizable(True, True)
        self.minsize(850, 550)
        self.grab_set()
        
        self.bg_col = self.app.active_theme_data.get("bg", "#0F0F0F")
        self.ent_col = self.app.active_theme_data.get("entry_bg", "#1E1F20")
        self.hl_col = self.app.active_theme_data.get("highlight", "#505050")
        self.fg_col = self.app.active_theme_data.get("font", "#FFFFFF")
        
        self.configure(bg=self.bg_col)
        
        self.pack_name = tk.StringVar()
        self.pack_suffix = tk.StringVar()
        
        self.atk_vars = {}
        self.dir_vars = {}
        self.macro_preset_vars = {}
        self.macro_custom_vars = []
        
        for i in range(4):
            self.macro_custom_vars.append({
                'name': tk.StringVar(), 'seq': tk.StringVar(), 
                'mode': tk.StringVar(value='Preset'), 'preset': tk.StringVar(value='Default'), 'file': tk.StringVar()
            })
        
        self.preset_options = list(GLYPH_SUFFIXES.keys())
        
        main_f = tk.Frame(self, bg=self.bg_col, padx=10, pady=10)
        main_f.pack(fill="both", expand=True)
        
        # Bottom Button Frame
        btn_f = tk.Frame(main_f, bg=self.bg_col)
        btn_f.pack(side="bottom", fill="x", pady=(10, 0))
        tk.Button(btn_f, text="Cancel", command=self.destroy, width=15, bg=self.ent_col, fg=self.fg_col, activebackground=self.hl_col, activeforeground=self.fg_col, relief="solid", bd=1).pack(side="right", padx=5)
        tk.Button(btn_f, text="Save Glyph Pack", command=self.save_pack, width=20, bg=self.ent_col, fg=self.fg_col, activebackground=self.hl_col, activeforeground=self.fg_col, relief="solid", bd=1).pack(side="right", padx=5)
        
        # Top Config Frame
        top_f = tk.LabelFrame(main_f, text=" Pack Configuration ", bg=self.bg_col, fg=self.fg_col, padx=10, pady=10)
        top_f.pack(side="top", fill="x", pady=(0, 10))
        
        tk.Label(top_f, text="Full Name:", bg=self.bg_col, fg=self.fg_col).grid(row=0, column=0, sticky="w", padx=5, pady=2)
        tk.Entry(top_f, textvariable=self.pack_name, width=30, bg=self.ent_col, fg=self.fg_col, insertbackground=self.fg_col).grid(row=0, column=1, sticky="w", padx=5, pady=2)
        
        tk.Label(top_f, text="ID (Max 3 chars):", bg=self.bg_col, fg=self.fg_col).grid(row=1, column=0, sticky="w", padx=5, pady=2)
        tk.Entry(top_f, textvariable=self.pack_suffix, width=10, bg=self.ent_col, fg=self.fg_col, insertbackground=self.fg_col).grid(row=1, column=1, sticky="w", padx=5, pady=2)
        tk.Label(top_f, text="(e.g., 'tk' becomes '_tk')", bg=self.bg_col, fg=self.fg_col).grid(row=1, column=2, sticky="w", padx=5, pady=2)
        
        # Attack Bulk Setter
        tk.Label(top_f, text="Bulk Set Attacks:", bg=self.bg_col, fg=self.fg_col).grid(row=2, column=0, sticky="w", padx=5, pady=2)
        self.bulk_atk_var = tk.StringVar(value="Default")
        atk_cb = ttk.Combobox(top_f, textvariable=self.bulk_atk_var, values=self.preset_options, width=15, state="readonly")
        atk_cb.grid(row=2, column=1, sticky="w", padx=5, pady=2)
        atk_cb.bind("<<ComboboxSelected>>", lambda e: [v['preset'].set(self.bulk_atk_var.get()) for v in self.atk_vars.values()])

        # Direction Bulk Setter
        tk.Label(top_f, text="Bulk Set Directions:", bg=self.bg_col, fg=self.fg_col).grid(row=3, column=0, sticky="w", padx=5, pady=2)
        self.bulk_dir_var = tk.StringVar(value="Default")
        dir_cb = ttk.Combobox(top_f, textvariable=self.bulk_dir_var, values=self.preset_options, width=15, state="readonly")
        dir_cb.grid(row=3, column=1, sticky="w", padx=5, pady=2)
        dir_cb.bind("<<ComboboxSelected>>", lambda e: [v['preset'].set(self.bulk_dir_var.get()) for v in self.dir_vars.values()])

        # Macro Bulk Setter
        tk.Label(top_f, text="Bulk Set Macros:", bg=self.bg_col, fg=self.fg_col).grid(row=4, column=0, sticky="w", padx=5, pady=2)
        self.bulk_mac_var = tk.StringVar(value="Default")
        mac_cb = ttk.Combobox(top_f, textvariable=self.bulk_mac_var, values=self.preset_options, width=15, state="readonly")
        mac_cb.grid(row=4, column=1, sticky="w", padx=5, pady=2)
        
        def apply_mac_bulk(*args):
            val = self.bulk_mac_var.get()
            for v in self.macro_preset_vars.values(): v['preset'].set(val)
            for c_macro in self.macro_custom_vars: c_macro['preset'].set(val)
        mac_cb.bind("<<ComboboxSelected>>", apply_mac_bulk)
        
        # Middle Notebook 
        self.notebook = ttk.Notebook(main_f)
        self.notebook.pack(side="top", fill="both", expand=True)
        
        self.build_attacks_tab()
        self.build_dirs_tab()
        self.build_macros_tab()
        
        self.bind("<MouseWheel>", self._on_mousewheel)
        self.bind("<Button-4>", self._on_mousewheel)
        self.bind("<Button-5>", self._on_mousewheel)
        
    def _on_mousewheel(self, event):
        widget = event.widget
        if isinstance(widget, str):
            try:
                widget = self.nametowidget(widget)
            except KeyError:
                return
                
        if not hasattr(widget, 'winfo_toplevel') or widget.winfo_toplevel() != self:
            return
            
        try:
            current_tab = self.notebook.index(self.notebook.select())
            if current_tab == 0: canvas = getattr(self, 'atk_canvas', None)
            elif current_tab == 1: canvas = getattr(self, 'dir_canvas', None)
            else: canvas = getattr(self, 'mac_canvas', None)
            
            if canvas:
                if event.delta:
                    delta = -1 if event.delta > 0 else 1
                    if abs(event.delta) >= 120:
                        delta = int(-1 * (event.delta / 120))
                    canvas.yview_scroll(delta, "units")
                elif event.num == 4:
                    canvas.yview_scroll(-1, "units")
                elif event.num == 5:
                    canvas.yview_scroll(1, "units")
        except Exception:
            pass

    def _make_row(self, parent, token, label_text, var_dict, show_map=False, default_map=""):
        f = tk.Frame(parent, bg=self.bg_col)
        f.pack(fill="x", pady=2)
        
        tk.Label(f, text=label_text, width=10, font=("Arial", 9, "bold"), bg=self.bg_col, fg=self.fg_col, anchor="w").pack(side="left")
        
        mode_var = tk.StringVar(value='Preset')
        preset_var = tk.StringVar(value='Default')
        file_var = tk.StringVar()
        map_var = tk.StringVar(value=default_map)
        
        var_dict[token] = {'mode': mode_var, 'preset': preset_var, 'file': file_var, 'map': map_var}
        
        def toggle_mode(m_var=mode_var, p_cb=None, u_btn=None):
            if m_var.get() == 'Preset':
                p_cb.configure(state="readonly")
                u_btn.config(state="disabled")
            else:
                p_cb.configure(state="disabled")
                u_btn.config(state="normal")
                
        tk.Radiobutton(f, text="Preset", variable=mode_var, value="Preset", command=lambda: toggle_mode(mode_var, cb, btn), bg=self.bg_col, fg=self.fg_col, selectcolor=self.ent_col, activebackground=self.bg_col, activeforeground=self.fg_col).pack(side="left", padx=2)
        tk.Radiobutton(f, text="Upload", variable=mode_var, value="Upload", command=lambda: toggle_mode(mode_var, cb, btn), bg=self.bg_col, fg=self.fg_col, selectcolor=self.ent_col, activebackground=self.bg_col, activeforeground=self.fg_col).pack(side="left", padx=2)
        
        cb = ttk.Combobox(f, textvariable=preset_var, values=self.preset_options, width=14, state="readonly")
        cb.pack(side="left", padx=5)
        
        def browse(f_var=file_var):
            path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
            if path: f_var.set(path) 
            
        btn = tk.Button(f, text="Browse Image...", command=browse, state="disabled", width=15, bg=self.ent_col, fg=self.fg_col, activebackground=self.hl_col, activeforeground=self.fg_col, disabledforeground=self.hl_col, relief="solid", bd=1)
        btn.pack(side="left", padx=5)
        
        lbl = tk.Entry(f, textvariable=file_var, width=15, state="readonly", bg=self.ent_col, fg=self.fg_col, readonlybackground=self.ent_col)
        lbl.pack(side="left", padx=5)
        
        if show_map:
            tk.Label(f, text="Map:", bg=self.bg_col, fg=self.fg_col).pack(side="left", padx=(10, 2))
            map_opts = ['X', 'Y', 'A', 'B', 'RIGHT_SHOULDER', 'LEFT_SHOULDER', 'RT', 'LT', 'START', 'BACK', 'LEFT_THUMB', 'RIGHT_THUMB']
            cb_map = ttk.Combobox(f, textvariable=map_var, values=map_opts, width=16)
            cb_map.pack(side="left")
            ToolTip(cb_map, "Select or type a combination using '+'.\n(BACK = Select, LEFT_THUMB = L3, RIGHT_THUMB = R3)")

    def build_attacks_tab(self):
        tab = tk.Frame(self.notebook, bg=self.bg_col, padx=10, pady=10)
        self.notebook.add(tab, text=" Attacks & Maps ")
        
        self.atk_canvas = tk.Canvas(tab, highlightthickness=0, bg=self.bg_col)
        vsb = ttk.Scrollbar(tab, orient="vertical", command=self.atk_canvas.yview)
        inner = tk.Frame(self.atk_canvas, bg=self.bg_col)
        
        inner_id = self.atk_canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda e: self.atk_canvas.configure(scrollregion=self.atk_canvas.bbox("all")))
        self.atk_canvas.bind("<Configure>", lambda e, c=self.atk_canvas, i_id=inner_id: c.itemconfig(i_id, width=e.width))
        self.atk_canvas.configure(yscrollcommand=vsb.set)
        
        self.atk_canvas.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        
        tk.Label(inner, text="Map multiple buttons with '+' (e.g. 'X+Y' or 'LT+RT'). Standard XInput names: X, Y, A, B, LT, RT, LEFT_SHOULDER, RIGHT_SHOULDER", wraplength=700, bg=self.bg_col, fg=self.fg_col).pack(fill="x", pady=(0, 10))
        
        defaults = {'lp': 'X', 'mp': 'Y', 'hp': 'RIGHT_SHOULDER', 'lk': 'A', 'mk': 'B', 'hk': 'RT', 'any_p': 'LEFT_SHOULDER', 'any_k': 'LT'}
        for atk in ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k']:
            self._make_row(inner, atk, atk.upper(), self.atk_vars, show_map=True, default_map=defaults[atk])

    def build_dirs_tab(self):
        tab = tk.Frame(self.notebook, bg=self.bg_col, padx=10, pady=10)
        self.notebook.add(tab, text=" Directions ")
        
        self.dir_canvas = tk.Canvas(tab, highlightthickness=0, bg=self.bg_col)
        vsb = ttk.Scrollbar(tab, orient="vertical", command=self.dir_canvas.yview)
        inner = tk.Frame(self.dir_canvas, bg=self.bg_col)
        
        inner_id = self.dir_canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda e: self.dir_canvas.configure(scrollregion=self.dir_canvas.bbox("all")))
        self.dir_canvas.bind("<Configure>", lambda e, c=self.dir_canvas, i_id=inner_id: c.itemconfig(i_id, width=e.width))
        self.dir_canvas.configure(yscrollcommand=vsb.set)
        
        self.dir_canvas.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        
        for d in ['up', 'down', 'left', 'right', 'upright', 'upleft', 'downright', 'downleft']:
            self._make_row(inner, d, d.capitalize(), self.dir_vars, show_map=False)

    def build_macros_tab(self):
        tab = tk.Frame(self.notebook, bg=self.bg_col, padx=10, pady=10)
        self.notebook.add(tab, text=" Macros ")
        
        self.mac_canvas = tk.Canvas(tab, highlightthickness=0, bg=self.bg_col)
        vsb = ttk.Scrollbar(tab, orient="vertical", command=self.mac_canvas.yview)
        inner = tk.Frame(self.mac_canvas, bg=self.bg_col)
        
        inner_id = self.mac_canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda e: self.mac_canvas.configure(scrollregion=self.mac_canvas.bbox("all")))
        self.mac_canvas.bind("<Configure>", lambda e, c=self.mac_canvas, i_id=inner_id: c.itemconfig(i_id, width=e.width))
        self.mac_canvas.configure(yscrollcommand=vsb.set)
        
        self.mac_canvas.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        
        tk.Label(inner, text="Standard Macros", font=("Arial", 10, "bold"), bg=self.bg_col, fg=self.fg_col, anchor="w").pack(fill="x", pady=(0, 5))
        for m in ['qcb', 'qcf', 'hcb', 'hcf', 'dp', 'rdp', '360']:
            self._make_row(inner, m, m.upper(), self.macro_preset_vars, show_map=False)
            
        tk.Frame(inner, bg=self.hl_col, height=2).pack(fill="x", pady=10)
        tk.Label(inner, text="Custom Macros (Up to 4)", font=("Arial", 10, "bold"), bg=self.bg_col, fg=self.fg_col, anchor="w").pack(fill="x", pady=(0, 5))
        
        for i in range(4):
            f = tk.LabelFrame(inner, text=f" Custom Macro {i+1} ", bg=self.bg_col, fg=self.fg_col, padx=5, pady=5)
            f.pack(fill="x", pady=5)
            
            tf = tk.Frame(f, bg=self.bg_col)
            tf.pack(fill="x", pady=2)
            tk.Label(tf, text="Name:", width=8, bg=self.bg_col, fg=self.fg_col).pack(side="left")
            tk.Entry(tf, textvariable=self.macro_custom_vars[i]['name'], width=15, bg=self.ent_col, fg=self.fg_col, insertbackground=self.fg_col).pack(side="left", padx=5)
            tk.Label(tf, text="Sequence (e.g. 'down downright right lp'):", bg=self.bg_col, fg=self.fg_col).pack(side="left", padx=(10, 5))
            tk.Entry(tf, textvariable=self.macro_custom_vars[i]['seq'], width=25, bg=self.ent_col, fg=self.fg_col, insertbackground=self.fg_col).pack(side="left")
            
            bf = tk.Frame(f, bg=self.bg_col)
            bf.pack(fill="x", pady=2)
            mode_var = self.macro_custom_vars[i]['mode']
            
            def browse(f_var=self.macro_custom_vars[i]['file']):
                path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
                if path: f_var.set(path)
                
            cb = ttk.Combobox(bf, textvariable=self.macro_custom_vars[i]['preset'], values=self.preset_options, width=14, state="readonly")
            btn = tk.Button(bf, text="Browse...", command=browse, state="disabled", width=10, bg=self.ent_col, fg=self.fg_col, activebackground=self.hl_col, activeforeground=self.fg_col, disabledforeground=self.hl_col, relief="solid", bd=1)
            
            def toggle_mode(m_var, p_cb, u_btn):
                if m_var.get() == 'Preset':
                    p_cb.configure(state="readonly")
                    u_btn.config(state="disabled")
                else:
                    p_cb.configure(state="disabled")
                    u_btn.config(state="normal")
                    
            tk.Radiobutton(bf, text="Preset", variable=mode_var, value="Preset", command=lambda m=mode_var, c=cb, b=btn: toggle_mode(m, c, b), bg=self.bg_col, fg=self.fg_col, selectcolor=self.ent_col, activebackground=self.bg_col, activeforeground=self.fg_col).pack(side="left", padx=2)
            tk.Radiobutton(bf, text="Upload", variable=mode_var, value="Upload", command=lambda m=mode_var, c=cb, b=btn: toggle_mode(m, c, b), bg=self.bg_col, fg=self.fg_col, selectcolor=self.ent_col, activebackground=self.bg_col, activeforeground=self.fg_col).pack(side="left", padx=2)
            
            cb.pack(side="left", padx=5)
            btn.pack(side="left", padx=5)
            
            lbl = tk.Entry(bf, textvariable=self.macro_custom_vars[i]['file'], width=15, state="readonly", bg=self.ent_col, fg=self.fg_col, readonlybackground=self.ent_col)
            lbl.pack(side="left", padx=5)

    def _process_image_save(self, token, var_data, target_dir, suffix):
        mode = var_data['mode'].get()
        dest_filename = f"{token.lower()}{suffix}.png"
        dest_path = os.path.join(target_dir, dest_filename)
        
        if mode == "Preset":
            preset_key = var_data['preset'].get()
            val = GLYPH_SUFFIXES.get(preset_key, ("",))
            preset_suf = val[0].lower() if isinstance(val, tuple) else val.lower()
            
            target_token = f"{token.lower()}{preset_suf}"
            
            is_macro = token.lower() in [m.split(',')[0].strip().lower().replace(' ', '_') for m in val[1:]] or token.lower() in ['qcb', 'qcf', 'hcb', 'hcf', 'dp', 'rdp', '360']
            if is_macro and preset_suf in ["_tk", "_t3"]:
                target_token += "_2"
                
            img = self.app.raw_images.get(target_token)
            
            if not img and target_token.endswith("_2"):
                img = self.app.raw_images.get(f"{token.lower()}{preset_suf}")
            if not img:
                img = self.app.raw_images.get(f"{token.lower()}_xb") if preset_suf == "_ps" else \
                      (self.app.raw_images.get(f"{token.lower()}_ps") if preset_suf == "_xb" else None)
            if not img:
                img = self.app.raw_images.get(token.lower())
                
            if img:
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                img.save(dest_path)
        else:
            src_path = var_data['file'].get()
            if src_path and os.path.exists(src_path):
                try:
                    img = Image.open(src_path).convert("RGBA")
                    if img.width > 1024 or img.height > 1024:
                        img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                    img.save(dest_path)
                except Exception as e:
                    print(f"Failed to process {src_path}: {e}")

    def save_pack(self):
        name = self.pack_name.get().strip()
        raw_suffix = self.pack_suffix.get().strip().lower()
        
        if not name or not raw_suffix:
            messagebox.showerror("Error", "Both Name and ID are required.")
            return
            
        suffix = raw_suffix if raw_suffix.startswith('_') else f"_{raw_suffix}"
        if len(suffix) > 4: suffix = suffix[:4]
        
        user_dir = os.path.join(get_base_dir(), "icons", "User")
        os.makedirs(user_dir, exist_ok=True)
        
        pack_dir = os.path.join(user_dir, name)
        if os.path.exists(pack_dir):
            if not messagebox.askyesno("Overwrite?", f"The pack '{name}' already exists. Overwrite?"):
                return
        os.makedirs(pack_dir, exist_ok=True)
        
        config = {
            "name": name,
            "suffix": suffix,
            "mappings": {},
            "macros": []
        }
        
        for atk, data in self.atk_vars.items():
            self._process_image_save(atk, data, pack_dir, suffix)
            map_val = data['map'].get().strip().replace(" ", "").upper()
            if map_val: config["mappings"][atk] = map_val
            
        for d, data in self.dir_vars.items():
            self._process_image_save(d, data, pack_dir, suffix)
            
        for m, data in self.macro_preset_vars.items():
            self._process_image_save(m, data, pack_dir, suffix)
            
        for i, c_macro in enumerate(self.macro_custom_vars):
            m_name = c_macro['name'].get().strip()
            m_seq = c_macro['seq'].get().strip()
            if m_name:
                safe_code = m_name.lower().replace(" ", "_")
                self._process_image_save(safe_code, c_macro, pack_dir, suffix)
                config["macros"].append(f"{m_name}, {m_seq}")
                
        config_path = os.path.join(pack_dir, "config.json")
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=4)
            
        self.app.icon_pil_cache.clear()
        self.app.icon_photo_cache.clear()
        self.app.load_images()
        self.app.load_custom_glyphs()
        self.app.setup_glyph_menu()
        
        self.app.current_glyph.set(name)
        self.app.glyph_mb.config(text=name)
        
        # This will call build_dynamic_macros(), update_palette_images(), 
        # refresh_all_displays(), and update the gamepad viewer.
        self.app._process_glyph_change()
        
        messagebox.showinfo("Success", f"Glyph pack '{name}' saved successfully!")
        self.destroy()

class ThemeBuilderWindow(tk.Toplevel):
    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.title("Theme Builder")
        self.geometry("450x420")
        self.resizable(False, False)
        
        self.mode_var = tk.StringVar()
        self.ui_bg_mode = tk.StringVar()
        self.palette_style_var = tk.StringVar()
        
        self.grad_btns_and_highlights_var = tk.BooleanVar()
        self.grad_standard_btns_var = tk.BooleanVar()
        self.grad_combos_var = tk.BooleanVar()
        self.grad_pinned_var = tk.BooleanVar()
        
        pad_f = ttk.Frame(self, padding=10)
        pad_f.pack(fill="both", expand=True)
        
        mode_f = ttk.Frame(pad_f)
        mode_f.pack(fill="x", pady=(0, 10))
        
        rb1 = ttk.Radiobutton(mode_f, text="Detailed Colors", variable=self.mode_var, value="Detailed", command=self.build_ui)
        rb1.pack(side="left", padx=(0, 10))
        ToolTip(rb1, "Create a basic theme by specifying the UI colors directly.")
        
        rb2 = ttk.Radiobutton(mode_f, text="4-Way Gradient", variable=self.mode_var, value="Gradient", command=self.build_ui)
        rb2.pack(side="left")
        ToolTip(rb2, "Create a gradient UI by specifying gradient colors, and selecting which element will have gradients. Specifying the UI colors directly is also possible.")
        
        self.content_f = ttk.Frame(pad_f)
        self.content_f.pack(fill="both", expand=True)
        
        btn_f = ttk.Frame(pad_f)
        btn_f.pack(fill="x", side="bottom", pady=10)
        
        btn_load_c = ttk.Button(btn_f, text="Load Current", command=self.load_current_theme, width=12)
        btn_load_c.pack(side="left")
        ToolTip(btn_load_c, "Loads the current theme to the theme editor.")
        
        btn_load_f = ttk.Button(btn_f, text="Load File", command=self.load_theme_dialog, width=10)
        btn_load_f.pack(side="left", padx=(5,0))
        ToolTip(btn_load_f, "Loads a specific file to the theme editor.")
        
        btn_save = ttk.Button(btn_f, text="Save", command=self.save_theme, width=6)
        btn_save.pack(side="right")
        ToolTip(btn_save, "Save your new theme for later use.")
        
        btn_prev = ttk.Button(btn_f, text="Preview", command=self.preview_theme, width=8)
        btn_prev.pack(side="right", padx=5)
        ToolTip(btn_prev, "Update the UI instantly with the selected colors.")

        self.color_vars = {}
        self.color_btns = {}
        
        self.load_current_theme()

    def _sync_vars_to_theme(self, theme):
        is_grad = "bg_grad" in theme
        self.mode_var.set("Gradient" if is_grad else "Detailed")
        self.ui_bg_mode.set(theme.get("ui_bg_mode", "Auto"))
        self.palette_style_var.set(theme.get("palette_style", "Classic"))
        
        self.grad_btns_and_highlights_var.set(theme.get("grad_btns_and_highlights", True))
        self.grad_standard_btns_var.set(theme.get("grad_standard_btns", False))
        self.grad_combos_var.set(theme.get("grad_combos", True))
        self.grad_pinned_var.set(theme.get("grad_pinned", True))
        
        if is_grad:
            grad = theme.get("bg_grad", ["#0022AA", "#000055", "#000055", "#000022"])
            if "tl" in self.color_vars:
                self.color_vars["tl"].set(grad[0] if len(grad)>0 else "#0022AA")
                self.color_vars["tr"].set(grad[1] if len(grad)>1 else "#000055")
                self.color_vars["bl"].set(grad[2] if len(grad)>2 else "#000055")
                self.color_vars["br"].set(grad[3] if len(grad)>3 else "#000022")
                
        if "bg" in self.color_vars:
            self.color_vars["bg"].set(theme.get("bg", "#0F0F0F"))
            self.color_vars["highlight"].set(theme.get("highlight", "#505050"))
            self.color_vars["font"].set(theme.get("font", "#FFFFFF"))
            self.color_vars["entry_bg"].set(theme.get("entry_bg", "#1E1F20"))
            self.color_vars["btn_bg"].set(theme.get("btn_bg", "#2A2A2A"))
            
        self.build_ui()

    def load_current_theme(self):
        self._sync_vars_to_theme(self.app.active_theme_data)

    def load_theme_dialog(self):
        filepath = filedialog.askopenfilename(defaultextension=".json", 
                                              filetypes=[("JSON Files", "*.json")], 
                                              initialdir=self.app.themes_dir)
        if filepath:
            self.app.load_theme(filepath, apply=True)
            self._sync_vars_to_theme(self.app.active_theme_data)

    def build_ui(self):
        for widget in self.content_f.winfo_children():
            widget.destroy()
        self.color_vars.clear()
        self.color_btns.clear()
        
        theme = self.app.active_theme_data
        
        if self.mode_var.get() == "Detailed":
            self.geometry("400x340")
            keys = [("Background", "bg", theme.get("bg", "#0F0F0F")), 
                    ("Highlight", "highlight", theme.get("highlight", "#505050")), 
                    ("Text Font", "font", theme.get("font", "#FFFFFF")), 
                    ("Entry Box", "entry_bg", theme.get("entry_bg", "#1E1F20")),
                    ("Buttons", "btn_bg", theme.get("btn_bg", "#2A2A2A"))]
            for label, key, default in keys:
                self._make_color_row(label, key, default)
                
            ttk.Separator(self.content_f, orient="horizontal").pack(fill="x", pady=10)
            style_f = ttk.Frame(self.content_f)
            style_f.pack(fill="x", pady=5)
            ttk.Label(style_f, text="Palette Button Style:", font=("Arial", 9, "bold")).pack(side="left")
            ttk.Radiobutton(style_f, text="Modern (Flat)", variable=self.palette_style_var, value="Modern").pack(side="left", padx=10)
            ttk.Radiobutton(style_f, text="Classic (Native)", variable=self.palette_style_var, value="Classic").pack(side="left")

        else:
            if self.ui_bg_mode.get() == "Custom":
                self.geometry("440x600")
            else:
                self.geometry("440x440")
                
            grad = theme.get("bg_grad", ["#0022AA", "#000055", "#000055", "#000022"])
            keys = [("Top Left", "tl", grad[0] if len(grad)>0 else "#0022AA"), 
                    ("Top Right", "tr", grad[1] if len(grad)>1 else "#000055"), 
                    ("Bottom Left", "bl", grad[2] if len(grad)>2 else "#000055"), 
                    ("Bottom Right", "br", grad[3] if len(grad)>3 else "#000022")]
            for label, key, default in keys:
                self._make_color_row(label, key, default)
                
            ttk.Separator(self.content_f, orient="horizontal").pack(fill="x", pady=10)
            ttk.Label(self.content_f, text="Apply Gradient To UI Elements:", font=("Arial", 9, "bold")).pack(anchor="w")
            
            toggle_f1 = ttk.Frame(self.content_f)
            toggle_f1.pack(fill="x", pady=2)
            cb1 = ttk.Checkbutton(toggle_f1, text="Palette Buttons & Highlights", variable=self.grad_btns_and_highlights_var)
            cb1.pack(side="left")
            ToolTip(cb1, "Applies gradient to all palette buttons.")
            
            cb2 = ttk.Checkbutton(toggle_f1, text="Standard Buttons", variable=self.grad_standard_btns_var)
            cb2.pack(side="left", padx=10)
            ToolTip(cb2, "Applies gradient to all other buttons.")

            toggle_f2 = ttk.Frame(self.content_f)
            toggle_f2.pack(fill="x", pady=2)
            cb3 = ttk.Checkbutton(toggle_f2, text="Combo Canvases", variable=self.grad_combos_var)
            cb3.pack(side="left")
            ToolTip(cb3, "Applies gradient to the window where combos are edited.")
            
            cb4 = ttk.Checkbutton(toggle_f2, text="Pinned Windows", variable=self.grad_pinned_var)
            cb4.pack(side="left", padx=10)
            ToolTip(cb4, "Applies gradient to all pinned combos.")

            ttk.Separator(self.content_f, orient="horizontal").pack(fill="x", pady=10)
            
            style_f = ttk.Frame(self.content_f)
            style_f.pack(fill="x", pady=(0, 5))
            ttk.Label(style_f, text="Palette Button Style:", font=("Arial", 9, "bold")).pack(side="left")
            ttk.Radiobutton(style_f, text="Modern (Flat)", variable=self.palette_style_var, value="Modern").pack(side="left", padx=10)
            ttk.Radiobutton(style_f, text="Classic (Native)", variable=self.palette_style_var, value="Classic").pack(side="left")

            ui_mode_f = ttk.Frame(self.content_f)
            ui_mode_f.pack(fill="x", pady=(5, 5))
            ttk.Label(ui_mode_f, text="UI Color Scheme:", font=("Arial", 9, "bold")).pack(side="left")
            
            rb_auto = ttk.Radiobutton(ui_mode_f, text="Auto", variable=self.ui_bg_mode, value="Auto", command=self.build_ui)
            rb_auto.pack(side="left", padx=10)
            ToolTip(rb_auto, "Creates UI theme based on selected gradient colors.")
            
            rb_cust = ttk.Radiobutton(ui_mode_f, text="Custom", variable=self.ui_bg_mode, value="Custom", command=self.build_ui)
            rb_cust.pack(side="left")
            ToolTip(rb_cust, "Specify UI theme colors directly, separate from selected gradient colors.")

            if self.ui_bg_mode.get() == "Custom":
                ui_keys = [("UI Background", "bg", theme.get("bg", "#0F0F0F")), 
                           ("Highlight", "highlight", theme.get("highlight", "#505050")), 
                           ("Text Font", "font", theme.get("font", "#FFFFFF")), 
                           ("Entry Box", "entry_bg", theme.get("entry_bg", "#1E1F20")),
                           ("Buttons", "btn_bg", theme.get("btn_bg", "#2A2A2A"))]
                for label, key, default in ui_keys:
                    self._make_color_row(label, key, default)

    def _make_color_row(self, label_text, dict_key, default_hex):
        f = ttk.Frame(self.content_f)
        f.pack(fill="x", pady=5)
        
        lbl = ttk.Label(f, text=label_text, width=15)
        lbl.pack(side="left")
        
        tt_text = ""
        if "Background" in label_text: tt_text = "Base UI background."
        elif "Highlight" in label_text: tt_text = "Color when any button is moused over."
        elif "Text Font" in label_text: tt_text = "Color of all font elements."
        elif "Entry Box" in label_text: tt_text = "Color of combo name, and drop down selections."
        elif "Buttons" in label_text: tt_text = "Color of all selectable menu options."
        
        if tt_text: ToolTip(lbl, tt_text)
        
        self.color_vars[dict_key] = tk.StringVar(value=default_hex)
        entry = tk.Entry(f, textvariable=self.color_vars[dict_key], width=10, justify="center")
        entry.pack(side="left", padx=5)
        if tt_text: ToolTip(entry, tt_text)
        
        btn = tk.Button(f, bg=default_hex, width=4, relief="solid", borderwidth=1)
        btn.is_color_preview = True # Ignore in apply_theme_to_child
        btn.config(command=lambda k=dict_key, b=btn, e=self.color_vars[dict_key]: self.pick_color(k, b, e))
        btn.pack(side="left", padx=5)
        self.color_btns[dict_key] = btn
        if tt_text: ToolTip(btn, tt_text)
        
        entry.bind("<Return>", lambda event, k=dict_key: self._update_btn_color(k))
        entry.bind("<FocusOut>", lambda event, k=dict_key: self._update_btn_color(k))

    def _update_btn_color(self, key):
        hex_val = self.color_vars[key].get()
        try:
            self.color_btns[key].config(bg=hex_val)
        except tk.TclError:
            pass 

    def pick_color(self, key, btn, string_var):
        picker = CustomColorPicker(self, string_var.get())
        self.wait_window(picker)
        if picker.result:
            string_var.set(picker.result)
            btn.config(bg=picker.result)

    def _generate_payload(self):
        if self.mode_var.get() == "Detailed":
            return {
                "palette_style": self.palette_style_var.get(),
                "bg": self.color_vars["bg"].get(),
                "highlight": self.color_vars["highlight"].get(),
                "font": self.color_vars["font"].get(),
                "entry_bg": self.color_vars["entry_bg"].get(),
                "btn_bg": self.color_vars["btn_bg"].get()
            }
        else:
            payload = {
                "palette_style": self.palette_style_var.get(),
                "bg_grad": [
                    self.color_vars["tl"].get(), self.color_vars["tr"].get(),
                    self.color_vars["bl"].get(), self.color_vars["br"].get()
                ],
                "grad_btns_and_highlights": self.grad_btns_and_highlights_var.get(),
                "grad_standard_btns": self.grad_standard_btns_var.get(),
                "grad_combos": self.grad_combos_var.get(),
                "grad_pinned": self.grad_pinned_var.get()
            }
            if self.ui_bg_mode.get() == "Custom":
                payload["ui_bg_mode"] = "Custom"
                payload["bg"] = self.color_vars["bg"].get()
                payload["highlight"] = self.color_vars["highlight"].get()
                payload["font"] = self.color_vars["font"].get()
                payload["entry_bg"] = self.color_vars["entry_bg"].get()
                payload["btn_bg"] = self.color_vars["btn_bg"].get()
            else:
                payload["ui_bg_mode"] = "Auto"
            return payload

    def preview_theme(self):
        payload = self._generate_payload()
        self.app.active_theme_data = self.app.compile_theme_data(payload)
        self.app.apply_theme()

    def save_theme(self):
        payload = self._generate_payload()
        filepath = filedialog.asksaveasfilename(defaultextension=".json", 
                                                filetypes=[("JSON Files", "*.json")], 
                                                initialdir=self.app.themes_dir,
                                                initialfile="CustomTheme.json")
        if filepath:
            try:
                with open(filepath, 'w') as f:
                    json.dump(payload, f, indent=4)
                self.app.load_theme(filepath)
                messagebox.showinfo("Success", "Theme saved and applied successfully!")
                self.destroy()
            except Exception as e:
                messagebox.showerror("Save Error", str(e))

class PinnedComboWindow(tk.Toplevel):
    def __init__(self, app, p, idx):
        super().__init__(app)
        self.app = app
        self.p = p
        self.idx = idx
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        
        try:
            alpha_val = float(self.app.pin_alpha_var.get()) / 100.0
            alpha_val = max(0.0, min(1.0, alpha_val))
        except ValueError:
            alpha_val = 0.85
            
        if self.app.modern_overlay_var.get():
            self.transparent_color = "#111111"
            self.configure(bg=self.transparent_color)
            self.attributes("-alpha", alpha_val)
        else:
            self.transparent_color = "#ff00ff"
            self.configure(bg=self.transparent_color)
            self.attributes("-alpha", 1.0)
            try:
                self.wm_attributes("-transparentcolor", self.transparent_color)
            except tk.TclError:
                pass 
            
        self.canvas = tk.Canvas(self, bg=self.transparent_color, bd=0, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.images = [] 
        
        self._offset_x = 0
        self._offset_y = 0
        self.bind_drag(self)
        self.bind_drag(self.canvas)

    def bind_drag(self, widget):
        widget.bind("<ButtonPress-1>", self.start_drag)
        widget.bind("<B1-Motion>", self.drag_window)

    def start_drag(self, event):
        self._offset_x = event.x_root - self.winfo_x()
        self._offset_y = event.y_root - self.winfo_y()

    def drag_window(self, event):
        x = event.x_root - self._offset_x
        y = event.y_root - self._offset_y
        self.geometry(f"+{x}+{y}")

class MasterPinnedWindow(tk.Toplevel):
    def __init__(self, app, p):
        super().__init__(app)
        self.app = app
        self.p = p
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        
        try:
            alpha_val = float(self.app.pin_alpha_var.get()) / 100.0
            alpha_val = max(0.0, min(1.0, alpha_val))
        except ValueError:
            alpha_val = 0.85
            
        if self.app.modern_overlay_var.get():
            self.transparent_color = "#111111"
            self.configure(bg=self.transparent_color)
            self.attributes("-alpha", alpha_val)
        else:
            self.transparent_color = "#ff00ff"
            self.configure(bg=self.transparent_color)
            self.attributes("-alpha", 1.0)
            try:
                self.wm_attributes("-transparentcolor", self.transparent_color)
            except tk.TclError:
                pass 
            
        self.canvas = tk.Canvas(self, bg=self.transparent_color, bd=0, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.images = [] 
        
        self._offset_x = 0
        self._offset_y = 0
        self.bind_drag(self)
        self.bind_drag(self.canvas)

    def bind_drag(self, widget):
        widget.bind("<ButtonPress-1>", self.start_drag)
        widget.bind("<B1-Motion>", self.drag_window)

    def start_drag(self, event):
        self._offset_x = event.x_root - self.winfo_x()
        self._offset_y = event.y_root - self.winfo_y()

    def drag_window(self, event):
        x = event.x_root - self._offset_x
        y = event.y_root - self._offset_y
        self.geometry(f"+{x}+{y}")

class GamepadViewerWindow(tk.Toplevel):
    def __init__(self, app, layout_name="Modern Gamepad", scale=1.0):
        super().__init__(app)
        self.app = app
        self.layout_name = layout_name
        self.scale = scale
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        
        self.canvas = tk.Canvas(self, bd=0, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        
        self.elements = {}
        self.layout_images = [] 
        
        self.apply_transparency()
        self.build_layout()

        self._offset_x = 0
        self._offset_y = 0
        self.canvas.bind("<ButtonPress-1>", self.start_drag)
        self.canvas.bind("<B1-Motion>", self.drag_window)

    def get_bg_filename(self, layout_name):
        if layout_name.startswith("Arcade - "):
            name = layout_name.replace("Arcade - ", "")
            if name.endswith(" 6"):
                return name[:-2] + "6B.png"
            elif name.endswith(" 8"):
                return name[:-2] + "8B.png"
            else:
                return name + ".png"
        return layout_name + ".png"
        
    def apply_transparency(self):
        if self.app.viewer_transparent_var.get():
            self.transparent_color = "#ff00ff"
            self.configure(bg=self.transparent_color)
            self.attributes("-alpha", 1.0)
            try: self.wm_attributes("-transparentcolor", self.transparent_color)
            except tk.TclError: pass
            self.canvas.configure(bg=self.transparent_color)
        else:
            try:
                alpha_val = float(self.app.pin_alpha_var.get()) / 100.0
                alpha_val = max(0.0, min(1.0, alpha_val))
            except ValueError:
                alpha_val = 0.85
            
            theme = self.app.active_theme_data
            self.transparent_color = theme.get("bg", "#0F0F0F")
            self.configure(bg=self.transparent_color)
            self.attributes("-alpha", alpha_val)
            try: self.wm_attributes("-transparentcolor", "")
            except tk.TclError: pass
            self.canvas.configure(bg=self.transparent_color)

    def build_layout(self):
        self.canvas.delete("all")
        self.elements.clear()
        self.layout_images.clear()
        
        theme = self.app.active_theme_data
        self.theme_bg = theme.get("bg", "#0F0F0F")
        self.base_color = theme.get("btn_bg", "#2A2A2A")
        self.hl_color = theme.get("highlight", "#00FF55") 
        
        try: self.out_w = int(self.app.viewer_outline_width_var.get())
        except ValueError: self.out_w = 2

        theme_val = GLYPH_SUFFIXES.get(self.app.current_glyph.get(), ("",))
        theme_suf = theme_val[0].lower() if isinstance(theme_val, tuple) else theme_val.lower()
        gp_suffix = f"{theme_suf}_gamepad"
        
        # Ensure the viewer only ever loads from the JSON dictionary
        if hasattr(self.app, 'custom_layouts') and self.layout_name in self.app.custom_layouts:
            layout = self.app.custom_layouts[self.layout_name].get("elements", [])
        else:
            layout = []

        max_w, max_h = 0, 0
        
        for item in layout:
            iid = item["id"]
            l_type = item.get("type", "shape")
            x = item["x"] * self.scale
            y = item["y"] * self.scale
            
            if l_type == "stick":
                r = item["size"] * self.scale
                ball_r = r * 0.6
                
                custom_fill = item.get("fill_color", "")
                custom_hl = item.get("hl_color", "")
                custom_base = item.get("base_color", "")
                
                base_color = custom_base if custom_base else "#111111"
                hl_color = custom_hl if custom_hl else self.hl_color
                ball_color = custom_fill if custom_fill else self.theme_bg
                
                base_id = self.canvas.create_oval(x-r, y-r, x+r, y+r, fill=base_color, outline=self.base_color, width=self.out_w)
                ball_id = self.canvas.create_oval(x-ball_r, y-ball_r, x+ball_r, y+ball_r, fill=ball_color, outline=self.base_color, width=self.out_w)
                
                self.elements[iid] = {
                    "type": "stick", "ball": ball_id, "base": base_id, 
                    "base_x": x, "base_y": y, "radius": r, "ball_radius": ball_r,
                    "base_color": base_color,
                    "hl_color": hl_color,
                    "ball_base_fill": ball_color
                }
                max_w = max(max_w, x+r)
                max_h = max(max_h, y+r)
                
            elif l_type == "glyph":
                r = item["size"] * self.scale
                
                wrapper_r = r * 1.00
                ring_r = r * 1.00
                active_wrapper_r = r * 1.25
                active_ring_r = r * 1.25

                inactive_bg_coords = (x-wrapper_r, y-wrapper_r, x+wrapper_r, y+wrapper_r)
                active_bg_coords = (x-active_wrapper_r, y-active_wrapper_r, x+active_wrapper_r, y+active_wrapper_r)

                inactive_ring_coords = (x-ring_r, y-ring_r, x+ring_r, y+ring_r)
                active_ring_coords = (x-active_ring_r, y-active_ring_r, x+active_ring_r, y+active_ring_r)
                
                custom_base = item.get("base_color", "")
                custom_hl = item.get("hl_color", "")
                glyph_bg = custom_base if custom_base else self.theme_bg
                hl_color = custom_hl if custom_hl else self.hl_color
                
                bg_id = self.canvas.create_oval(*inactive_bg_coords, fill=glyph_bg, outline="", width=0)
                
                calc_scale = (r * 1.8) / 40.0
                img = self.app.get_icon(item["token"], scale_factor=calc_scale, is_pinned=False, override_suffix=gp_suffix)
                
                if img:
                    self.layout_images.append(img)
                    self.canvas.create_image(x, y, image=img, anchor="center")
                    
                overlay_id = self.canvas.create_oval(*inactive_ring_coords, fill="", outline=self.base_color, width=self.out_w)
                
                self.elements[iid] = {
                    "type": "glyph", 
                    "bg": bg_id, 
                    "overlay": overlay_id,
                    "inactive_coords": inactive_ring_coords,
                    "active_coords": active_ring_coords,
                    "inactive_bg_coords": inactive_bg_coords,
                    "active_bg_coords": active_bg_coords,
                    "base_bg_color": glyph_bg,
                    "hl_color": hl_color
                }
                max_w = max(max_w, x+active_ring_r)
                max_h = max(max_h, y+active_ring_r)
                
            elif l_type == "rect":
                w = item["w"] * self.scale
                h = item["h"] * self.scale
                inactive_coords = (x, y, x+w, y+h)
                
                cx, cy = x + w/2, y + h/2
                aw, ah = w * 1.2, h * 1.2
                active_coords = (cx - aw/2, cy - ah/2, cx + aw/2, cy + ah/2)
                
                custom_fill = item.get("fill_color", "")
                custom_hl = item.get("hl_color", "")
                rect_base = custom_fill if custom_fill else self.base_color
                rect_hl = custom_hl if custom_hl else self.hl_color
                
                canvas_id = self.canvas.create_rectangle(*inactive_coords, fill=rect_base, outline=rect_base, width=self.out_w)
                
                if "token" in item:
                    min_dim = min(w, h)
                    calc_scale = (min_dim * 1.2) / 40.0
                    img = self.app.get_icon(item["token"], scale_factor=calc_scale, is_pinned=False, override_suffix=gp_suffix)
                    if img:
                        self.layout_images.append(img)
                        self.canvas.create_image(cx, cy, image=img, anchor="center")

                self.elements[iid] = {
                    "type": "shape", 
                    "shape": canvas_id,
                    "inactive_coords": inactive_coords, 
                    "active_coords": active_coords,
                    "base_color": rect_base,
                    "hl_color": rect_hl
                }
                max_w = max(max_w, x+aw)
                max_h = max(max_h, y+ah)
                
            elif l_type == "circle":
                r = item["size"] * self.scale
                inactive_coords = (x-r, y-r, x+r, y+r)
                active_r = r * 1.2
                active_coords = (x-active_r, y-active_r, x+active_r, y+active_r)
                
                custom_fill = item.get("fill_color", "")
                custom_hl = item.get("hl_color", "")
                circle_base = custom_fill if custom_fill else self.base_color
                circle_hl = custom_hl if custom_hl else self.hl_color
                
                canvas_id = self.canvas.create_oval(*inactive_coords, fill=circle_base, outline=circle_base, width=self.out_w)
                self.elements[iid] = {
                    "type": "shape", 
                    "shape": canvas_id,
                    "inactive_coords": inactive_coords, 
                    "active_coords": active_coords,
                    "base_color": circle_base,
                    "hl_color": circle_hl
                }
                max_w = max(max_w, x+active_r)
                max_h = max(max_h, y+active_r)

        target_w, target_h = int(max_w + 30), int(max_h + 30)

        if getattr(self.app, 'viewer_bg_image_var', None) and self.app.viewer_bg_image_var.get():
            img_path = None
            
            if hasattr(self.app, 'custom_layouts') and self.layout_name in self.app.custom_layouts:
                custom_bg = self.app.custom_layouts[self.layout_name].get("bg_image", "")
                if custom_bg and os.path.exists(custom_bg):
                    img_path = custom_bg
            if not img_path:
                bg_filename = self.get_bg_filename(self.layout_name)
                base_dir = get_base_dir()
                img_path = os.path.join(base_dir, "icons", bg_filename)
                if not os.path.exists(img_path):
                    img_path = os.path.join(base_dir, bg_filename)
            
            if img_path and os.path.exists(img_path):
                try:
                    pil_img = Image.open(img_path).convert("RGBA")
                    new_w = int(pil_img.width * self.scale)
                    new_h = int(pil_img.height * self.scale)
                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                    
                    if self.app.viewer_transparent_var.get():
                        hard_mask = pil_img.getchannel('A').point(lambda p: 255 if p >= 128 else 0)
                        pil_img.putalpha(255)
                        clean_img = Image.new("RGBA", pil_img.size, (255, 0, 255, 255))
                        clean_img.paste(pil_img, (0, 0), hard_mask)
                        pil_img = clean_img

                    self.controller_bg_photo = ImageTk.PhotoImage(pil_img)
                    
                    target_w = max(target_w, new_w)
                    target_h = max(target_h, new_h)
                    
                    ctrl_bg_id = self.canvas.create_image(0, 0, image=self.controller_bg_photo, anchor="nw")
                    self.canvas.tag_lower(ctrl_bg_id)
                except Exception as e:
                    print(f"Failed to load controller bg: {e}")

        self.geometry(f"{target_w}x{target_h}")

        if not self.app.viewer_transparent_var.get():
            if theme.get("grad_pinned", True) and "bg_grad" in theme:
                img = Image.new("RGB", (2, 2))
                rgbs = [tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) for h in theme["bg_grad"]]
                img.putpixel((0, 0), rgbs[0])
                img.putpixel((1, 0), rgbs[1])
                img.putpixel((0, 1), rgbs[2])
                img.putpixel((1, 1), rgbs[3])
                img = img.resize((target_w, target_h), Image.Resampling.BICUBIC)
                photo = ImageTk.PhotoImage(img)
                self.bg_image = photo 
                bg_id = self.canvas.create_image(0, 0, image=photo, anchor="nw")
                self.canvas.tag_lower(bg_id)
            else:
                bg_id = self.canvas.create_rectangle(0, 0, target_w, target_h, fill=theme.get("bg", "#0F0F0F"), outline="")
                self.canvas.tag_lower(bg_id)

    def update_inputs(self, state, dpad_state, l_thumb=(0,0), r_thumb=(0,0)):
        try: out_w = int(self.app.viewer_outline_width_var.get())
        except ValueError: out_w = 2
        try: hl_w = int(self.app.viewer_highlight_width_var.get())
        except ValueError: hl_w = 4

        for iid, data in self.elements.items():
            
            if data["type"] == "stick":
                dx, dy = 0, 0
                
                if iid == "RIGHT_THUMB":
                    dx, dy = r_thumb[0], -r_thumb[1]
                elif iid == "LEFT_THUMB":
                    lx, ly = l_thumb[0], -l_thumb[1]
                    if abs(lx) > 0.15 or abs(ly) > 0.15: 
                        dx, dy = lx, ly
                else: 
                    lx, ly = l_thumb[0], -l_thumb[1]
                    if abs(lx) > 0.15 or abs(ly) > 0.15: 
                        dx, dy = lx, ly
                    elif dpad_state:
                        if 'up' in dpad_state: dy = -1
                        if 'down' in dpad_state: dy = 1
                        if 'left' in dpad_state: dx = -1
                        if 'right' in dpad_state: dx = 1
                        
                        if dx != 0 and dy != 0:
                            dx *= 0.707
                            dy *= 0.707

                offset_mag = data["radius"] * 0.6 
                mag = (dx**2 + dy**2)**0.5
                if mag > 1.0:
                    dx /= mag
                    dy /= mag
                    
                new_x = data["base_x"] + (dx * offset_mag)
                new_y = data["base_y"] + (dy * offset_mag)
                
                r = data["ball_radius"]
                self.canvas.coords(data["ball"], new_x - r, new_y - r, new_x + r, new_y + r)
                
                is_active = (abs(dx) > 0.1 or abs(dy) > 0.1)
                is_clicked = state.get(iid, False)
                out_color = data["hl_color"] if is_active or is_clicked else self.base_color
                
                self.canvas.itemconfig(data["base"], outline=out_color, width=hl_w if is_active or is_clicked else out_w)
                self.canvas.itemconfig(data["ball"], outline=out_color, width=hl_w if is_active or is_clicked else out_w)
                
                if is_clicked:
                    self.canvas.itemconfig(data["ball"], fill=data["hl_color"])
                else:
                    self.canvas.itemconfig(data["ball"], fill=data["ball_base_fill"])
                    
            elif data["type"] == "glyph":
                is_active = state.get(iid, False)
                ring_coords = data["active_coords"] if is_active else data["inactive_coords"]
                bg_coords = data["active_bg_coords"] if is_active else data["inactive_bg_coords"]
                color = data["hl_color"] if is_active else self.base_color
                
                self.canvas.coords(data["bg"], *bg_coords)
                self.canvas.coords(data["overlay"], *ring_coords)
                
                self.canvas.itemconfig(data["bg"], fill=color if is_active else data["base_bg_color"])
                self.canvas.itemconfig(data["overlay"], outline=color, width=hl_w if is_active else out_w)
                
            elif data["type"] == "shape":
                is_active = state.get(iid, False)
                coords = data["active_coords"] if is_active else data["inactive_coords"]
                
                base_c = data.get("base_color", self.base_color)
                hl_c = data.get("hl_color", self.hl_color)
                color = hl_c if is_active else base_c
                
                self.canvas.coords(data["shape"], *coords)
                self.canvas.itemconfig(data["shape"], fill=color, outline=color, width=hl_w if is_active else out_w)

    def start_drag(self, event):
        self._offset_x = event.x_root - self.winfo_x()
        self._offset_y = event.y_root - self.winfo_y()

    def drag_window(self, event):
        x = event.x_root - self._offset_x
        y = event.y_root - self._offset_y
        self.geometry(f"+{x}+{y}")

class GamepadLayoutBuilderWindow(tk.Toplevel):
    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.title("Controller Layout Builder")
        
        win_w, win_h = 950, 550
        self.update_idletasks()
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()
        pos_x = int((screen_w / 2) - (win_w / 2))
        pos_y = int((screen_h / 2) - (win_h / 2))
        pos_y = max(0, pos_y - 40)
        
        self.geometry(f"{win_w}x{win_h}+{pos_x}+{pos_y}")
        self.minsize(800, 450)
        
        self.bg_col = self.app.active_theme_data.get("bg", "#0F0F0F")
        self.ent_col = self.app.active_theme_data.get("entry_bg", "#1E1F20")
        self.fg_col = self.app.active_theme_data.get("font", "#FFFFFF")
        self.hl_col = self.app.active_theme_data.get("highlight", "#505050")
        self.configure(bg=self.bg_col)
        
        self.layout_name = tk.StringVar(value="My Custom Layout")
        self.bg_image_path = tk.StringVar()
        self.load_layout_var = tk.StringVar()
        self.view_scale = tk.DoubleVar(value=1.0)
        
        self.elements = []
        self.selected_idx = None
        self.drag_data = {"item": None, "start_ex": 0, "start_ey": 0, "start_el_x": 0, "start_el_y": 0}
        self._updating_props = False 

        self.prop_vars = {
            "id": tk.StringVar(),
            "type": tk.StringVar(), "token": tk.StringVar(),
            "x": tk.IntVar(), "y": tk.IntVar(),
            "size": tk.IntVar(), "w": tk.IntVar(), "h": tk.IntVar(),
            "fill_color": tk.StringVar(), "hl_color": tk.StringVar(),
            "base_color": tk.StringVar()
        }

        self.base_id_opts = ['X', 'Y', 'A', 'B', 'LT', 'RT', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 
                             'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'START', 'BACK', 'LEFT_THUMB', 'RIGHT_THUMB', 'joystick']
        self.adv_id_opts = ['L_STICK_UP', 'L_STICK_DOWN', 'L_STICK_LEFT', 'L_STICK_RIGHT',
                            'R_STICK_UP', 'R_STICK_DOWN', 'R_STICK_LEFT', 'R_STICK_RIGHT', 'TOUCHPAD']

        self.setup_ui()
        self.redraw_canvas()

    def setup_ui(self):
        main_f = tk.Frame(self, bg=self.bg_col)
        main_f.pack(fill="both", expand=True, padx=10, pady=5)

        canvas_f = tk.Frame(main_f, bg=self.bg_col, relief="sunken", bd=2)
        canvas_f.pack(side="left", fill="both", expand=True, padx=(0, 10))
        
        self.canvas = tk.Canvas(canvas_f, bg="#2A2A2A", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<ButtonPress-1>", self.on_canvas_click)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)

        ctrl_f = tk.Frame(main_f, bg=self.bg_col, width=320)
        ctrl_f.pack(side="right", fill="y")

        btn_f = tk.Frame(ctrl_f, bg=self.bg_col)
        btn_f.pack(side="bottom", fill="x", pady=(5, 0))
        tk.Button(btn_f, text="Save Layout", command=self.save_layout, bg=self.hl_col, fg=self.fg_col, relief="solid", bd=1, font=("Arial", 10, "bold")).pack(side="left", fill="x", expand=True, padx=(0, 2))
        tk.Button(btn_f, text="Delete", command=self.delete_layout, bg="#882222", fg="#FFFFFF", relief="solid", bd=1, font=("Arial", 10, "bold")).pack(side="right", fill="x", expand=True, padx=(2, 0))

        prop_f = tk.LabelFrame(ctrl_f, text=" Selected Element ", bg=self.bg_col, fg=self.fg_col)
        prop_f.pack(side="bottom", fill="x", pady=(5, 5))
        
        grid_kwargs = {"bg": self.bg_col, "fg": self.fg_col, "anchor": "w"}

        def on_entry_change(*args):
            self.sync_props_to_element()
            
        # Row 0: ID
        tk.Label(prop_f, text="Input ID:", **grid_kwargs).grid(row=0, column=0, padx=2, pady=1)
        cb_id_prop = ttk.Combobox(prop_f, textvariable=self.prop_vars["id"], values=self.base_id_opts + self.adv_id_opts, width=12)
        cb_id_prop.grid(row=0, column=1, columnspan=3, sticky="w", padx=2, pady=1)
        cb_id_prop.bind("<<ComboboxSelected>>", lambda e: self.sync_props_to_element())
        cb_id_prop.bind("<KeyRelease>", on_entry_change)

        # Row 1: Type / Token
        tk.Label(prop_f, text="Type:", **grid_kwargs).grid(row=1, column=0, padx=2, pady=1)
        cb_type = ttk.Combobox(prop_f, textvariable=self.prop_vars["type"], values=["glyph", "rect", "circle", "stick"], width=8)
        cb_type.grid(row=1, column=1, padx=2, pady=1)
        cb_type.bind("<<ComboboxSelected>>", lambda e: self.sync_props_to_element())

        tk.Label(prop_f, text="Token:", **grid_kwargs).grid(row=1, column=2, padx=2, pady=1)
        token_opts = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'up', 'down', 'left', 'right', 'start', 'select']
        cb_tok = ttk.Combobox(prop_f, textvariable=self.prop_vars["token"], values=token_opts, width=8)
        cb_tok.grid(row=1, column=3, padx=2, pady=1)
        cb_tok.bind("<<ComboboxSelected>>", lambda e: self.sync_props_to_element())

        # Row 2: X / Y
        tk.Label(prop_f, text="X:", **grid_kwargs).grid(row=2, column=0, padx=2, pady=1)
        ent_x = tk.Entry(prop_f, textvariable=self.prop_vars["x"], width=5)
        ent_x.grid(row=2, column=1, sticky="w", padx=2)
        ent_x.bind("<KeyRelease>", on_entry_change)

        tk.Label(prop_f, text="Y:", **grid_kwargs).grid(row=2, column=2, padx=2, pady=1)
        ent_y = tk.Entry(prop_f, textvariable=self.prop_vars["y"], width=5)
        ent_y.grid(row=2, column=3, sticky="w", padx=2)
        ent_y.bind("<KeyRelease>", on_entry_change)

        # Row 3 (Combo frame for sizing)
        sz_f = tk.Frame(prop_f, bg=self.bg_col)
        sz_f.grid(row=3, column=0, columnspan=4, sticky="w", pady=1)
        tk.Label(sz_f, text="Size/R:", **grid_kwargs).pack(side="left")
        ent_sz = tk.Entry(sz_f, textvariable=self.prop_vars["size"], width=3)
        ent_sz.pack(side="left", padx=1)
        ent_sz.bind("<KeyRelease>", on_entry_change)
        
        tk.Label(sz_f, text="W:", **grid_kwargs).pack(side="left", padx=(4,0))
        ent_w = tk.Entry(sz_f, textvariable=self.prop_vars["w"], width=3)
        ent_w.pack(side="left", padx=1)
        ent_w.bind("<KeyRelease>", on_entry_change)
        
        tk.Label(sz_f, text="H:", **grid_kwargs).pack(side="left", padx=(4,0))
        ent_h = tk.Entry(sz_f, textvariable=self.prop_vars["h"], width=3)
        ent_h.pack(side="left", padx=1)
        ent_h.bind("<KeyRelease>", on_entry_change)

        # Row 4 (Fill Color)
        tk.Label(prop_f, text="Fill Color:", **grid_kwargs).grid(row=4, column=0, padx=2, pady=1)
        fill_f = tk.Frame(prop_f, bg=self.bg_col)
        fill_f.grid(row=4, column=1, columnspan=3, sticky="w")
        ent_fill = tk.Entry(fill_f, textvariable=self.prop_vars["fill_color"], width=7)
        ent_fill.pack(side="left", padx=(0, 2))
        ent_fill.bind("<KeyRelease>", on_entry_change)
        tk.Button(fill_f, text="RGB", command=lambda: self.pick_element_color("fill_color"), bg=self.ent_col, fg=self.fg_col, bd=1).pack(side="left", padx=2)
        tk.Button(fill_f, text="Inherit", command=lambda: [self.prop_vars["fill_color"].set(""), self.sync_props_to_element()], bg=self.ent_col, fg=self.fg_col, bd=1).pack(side="left")

        # Row 5 (Base Color)
        tk.Label(prop_f, text="Base Color:", **grid_kwargs).grid(row=5, column=0, padx=2, pady=1)
        base_c_f = tk.Frame(prop_f, bg=self.bg_col)
        base_c_f.grid(row=5, column=1, columnspan=3, sticky="w")
        ent_base_c = tk.Entry(base_c_f, textvariable=self.prop_vars["base_color"], width=7)
        ent_base_c.pack(side="left", padx=(0, 2))
        ent_base_c.bind("<KeyRelease>", on_entry_change)
        tk.Button(base_c_f, text="RGB", command=lambda: self.pick_element_color("base_color"), bg=self.ent_col, fg=self.fg_col, bd=1).pack(side="left", padx=2)
        tk.Button(base_c_f, text="Inherit", command=lambda: [self.prop_vars["base_color"].set(""), self.sync_props_to_element()], bg=self.ent_col, fg=self.fg_col, bd=1).pack(side="left")

        # Row 6 (HL Color)
        tk.Label(prop_f, text="HL Color:", **grid_kwargs).grid(row=6, column=0, padx=2, pady=1)
        hl_f = tk.Frame(prop_f, bg=self.bg_col)
        hl_f.grid(row=6, column=1, columnspan=3, sticky="w")
        ent_hl = tk.Entry(hl_f, textvariable=self.prop_vars["hl_color"], width=7)
        ent_hl.pack(side="left", padx=(0, 2))
        ent_hl.bind("<KeyRelease>", on_entry_change)
        tk.Button(hl_f, text="RGB", command=lambda: self.pick_element_color("hl_color"), bg=self.ent_col, fg=self.fg_col, bd=1).pack(side="left", padx=2)
        tk.Button(hl_f, text="Inherit", command=lambda: [self.prop_vars["hl_color"].set(""), self.sync_props_to_element()], bg=self.ent_col, fg=self.fg_col, bd=1).pack(side="left")

        # Row 7 (Remove Element)
        tk.Button(prop_f, text="Remove Element", command=self.remove_element, bg="#882222", fg="#FFFFFF", relief="solid", bd=1).grid(row=7, column=0, columnspan=4, pady=4, sticky="ew")

        load_f = tk.LabelFrame(ctrl_f, text=" Load Existing Layout ", bg=self.bg_col, fg=self.fg_col)
        load_f.pack(side="top", fill="x", pady=(0, 5))
        
        all_layouts = list(getattr(self.app, 'custom_layouts', {}).keys())
        self.load_layout_cb = ttk.Combobox(load_f, textvariable=self.load_layout_var, values=all_layouts, state="readonly")
        self.load_layout_cb.pack(side="left", fill="x", expand=True, padx=5, pady=5)
        tk.Button(load_f, text="Load", command=self.load_layout_into_editor, bg=self.ent_col, fg=self.fg_col, relief="solid", bd=1).pack(side="right", padx=5, pady=5)

        cfg_f = tk.LabelFrame(ctrl_f, text=" Layout Settings ", bg=self.bg_col, fg=self.fg_col)
        cfg_f.pack(side="top", fill="x", pady=(0, 5))
        
        tk.Label(cfg_f, text="Name:", bg=self.bg_col, fg=self.fg_col).grid(row=0, column=0, sticky="w", padx=5, pady=2)
        tk.Entry(cfg_f, textvariable=self.layout_name, bg=self.ent_col, fg=self.fg_col).grid(row=0, column=1, padx=5, pady=2, sticky="ew")
        
        tk.Label(cfg_f, text="Background:", bg=self.bg_col, fg=self.fg_col).grid(row=1, column=0, sticky="w", padx=5, pady=2)
        tk.Button(cfg_f, text="Browse", command=self.browse_bg, bg=self.ent_col, fg=self.fg_col, relief="solid", bd=1).grid(row=1, column=1, sticky="w", padx=5, pady=2)

        tk.Label(cfg_f, text="View Scale:", bg=self.bg_col, fg=self.fg_col).grid(row=2, column=0, sticky="w", padx=5, pady=2)
        zoom_slider = tk.Scale(cfg_f, from_=0.25, to=3.0, resolution=0.1, orient="horizontal", 
                               variable=self.view_scale, bg=self.bg_col, fg=self.fg_col, 
                               highlightthickness=0, command=lambda v: self.redraw_canvas())
        zoom_slider.grid(row=2, column=1, sticky="ew", padx=5)

        list_f = tk.LabelFrame(ctrl_f, text=" Elements ", bg=self.bg_col, fg=self.fg_col)
        list_f.pack(side="top", fill="both", expand=True, pady=(0, 5))
        
        btn_add_f = tk.Frame(list_f, bg=self.bg_col)
        btn_add_f.pack(side="bottom", fill="x", padx=5, pady=5)
        
        self.listbox = tk.Listbox(list_f, bg=self.ent_col, fg=self.fg_col, selectbackground=self.hl_col)
        self.listbox.pack(side="top", fill="both", expand=True, padx=5, pady=5)
        self.listbox.bind('<<ListboxSelect>>', self.on_list_select)
        
        self.new_id_var = tk.StringVar(value="X")
        self.advanced_id_var = tk.BooleanVar(value=False)

        def update_id_opts():
            if self.advanced_id_var.get():
                cb_id.config(values=self.base_id_opts + self.adv_id_opts)
            else:
                cb_id.config(values=self.base_id_opts)
                if self.new_id_var.get() in self.adv_id_opts:
                    self.new_id_var.set('X')

        cb_adv = ttk.Checkbutton(btn_add_f, text="Adv.", variable=self.advanced_id_var, command=update_id_opts)
        cb_adv.pack(side="left", padx=2)
        
        cb_id = ttk.Combobox(btn_add_f, textvariable=self.new_id_var, values=self.base_id_opts, width=12)
        cb_id.pack(side="left")
        
        tk.Button(btn_add_f, text="Add", command=self.add_element, bg=self.ent_col, fg=self.fg_col, relief="solid", bd=1).pack(side="right")

    def pick_element_color(self, var_name):
        current = self.prop_vars[var_name].get()
        if not current or not current.startswith("#"): 
            current = "#FFFFFF"
        picker = CustomColorPicker(self, current)
        self.wait_window(picker)
        if picker.result:
            self.prop_vars[var_name].set(picker.result)
            self.sync_props_to_element()

    def load_layout_into_editor(self):
        target = self.load_layout_var.get()
        if not target: return
        
        if hasattr(self.app, 'custom_layouts') and target in self.app.custom_layouts:
            data = self.app.custom_layouts[target]
            self.layout_name.set(data.get("name", target))
            self.elements = [dict(el) for el in data.get("elements", [])]
            
            saved_bg = data.get("bg_image", "")
            if not saved_bg or not os.path.exists(saved_bg):
                bg_filename = target + ".png" 
                if target.startswith("Arcade - "):
                    name = target.replace("Arcade - ", "")
                    if name.endswith(" 6"): bg_filename = name[:-2] + "6B.png"
                    elif name.endswith(" 8"): bg_filename = name[:-2] + "8B.png"
                    else: bg_filename = name + ".png"
                    
                base_dir = get_base_dir()
                img_path = os.path.join(base_dir, "icons", bg_filename)
                if not os.path.exists(img_path):
                    img_path = os.path.join(base_dir, bg_filename)
                
                if os.path.exists(img_path): saved_bg = img_path
                else: saved_bg = ""

            self.bg_image_path.set(saved_bg)
        
        self.selected_idx = None
        self.drag_data["item"] = None
        self.update_listbox()
        self.redraw_canvas()

    def browse_bg(self):
        path = filedialog.askopenfilename(parent=self, filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
        if path:
            self.bg_image_path.set(path)
            self.redraw_canvas()

    def add_element(self):
        new_id = self.new_id_var.get().strip()
        if not new_id: return
        
        el_type = "glyph"
        tok = "lp"
        w, h, size = 15, 15, 15
        
        if new_id in ["LEFT_THUMB", "RIGHT_THUMB", "joystick"]:
            el_type = "stick"
            size = 14
        elif "DPAD" in new_id or "STICK_" in new_id or new_id in ["LT", "RT", "START", "BACK"]:
            el_type = "rect"
            w, h = 15, 15
            if new_id == "LT": tok = "any_k"
            elif new_id == "RT": tok = "hk"
            elif new_id in ["START", "BACK"]: w, h = 10, 5
        elif new_id == "TOUCHPAD":
            el_type = "rect"
            w, h = 60, 35
        elif new_id in ["X", "Y", "A", "B", "LEFT_SHOULDER", "RIGHT_SHOULDER"]:
            el_type = "glyph"
            size = 13
            if new_id == "X": tok = "lp"
            elif new_id == "Y": tok = "mp"
            elif new_id == "A": tok = "lk"
            elif new_id == "B": tok = "mk"
            elif new_id == "RIGHT_SHOULDER": tok = "hp"
            elif new_id == "LEFT_SHOULDER": tok = "any_p"
            
        el = {"id": new_id, "type": el_type, "token": tok, "x": 100, "y": 100, "size": size, "w": w, "h": h}
        
        self.elements.append(el)
        self.selected_idx = len(self.elements) - 1
        self.update_listbox()
        self.load_props_from_element()
        self.redraw_canvas()

    def remove_element(self):
        if self.selected_idx is not None and 0 <= self.selected_idx < len(self.elements):
            self.elements.pop(self.selected_idx)
            self.selected_idx = None
            self.update_listbox()
            self.redraw_canvas()

    def update_listbox(self):
        self.listbox.delete(0, tk.END)
        alias_map = {
            "LEFT_SHOULDER": "LB", "RIGHT_SHOULDER": "RB",
            "LEFT_THUMB": "L3", "RIGHT_THUMB": "R3"
        }
        for el in self.elements:
            display_name = alias_map.get(el['id'], el['id'])
            self.listbox.insert(tk.END, f"{display_name} ({el['type']})")
        if self.selected_idx is not None:
            self.listbox.selection_set(self.selected_idx)

    def on_list_select(self, event):
        sel = self.listbox.curselection()
        if sel:
            self.selected_idx = sel[0]
            self.load_props_from_element()
            self.redraw_canvas()

    def load_props_from_element(self):
        if self.selected_idx is None: return
        el = self.elements[self.selected_idx]
        
        self._updating_props = True 
        self.prop_vars["id"].set(el.get("id", ""))
        self.prop_vars["type"].set(el.get("type", "glyph"))
        self.prop_vars["token"].set(el.get("token", ""))
        self.prop_vars["x"].set(el.get("x", 100))
        self.prop_vars["y"].set(el.get("y", 100))
        self.prop_vars["size"].set(el.get("size", 15))
        self.prop_vars["w"].set(el.get("w", 20))
        self.prop_vars["h"].set(el.get("h", 20))
        self.prop_vars["fill_color"].set(el.get("fill_color", ""))
        self.prop_vars["hl_color"].set(el.get("hl_color", ""))
        self.prop_vars["base_color"].set(el.get("base_color", ""))
        self._updating_props = False 

    def sync_props_to_element(self):
        if self.selected_idx is None or self._updating_props: return
        el = self.elements[self.selected_idx]
        el["id"] = self.prop_vars["id"].get()
        el["type"] = self.prop_vars["type"].get()
        el["token"] = self.prop_vars["token"].get()
        try:
            el["x"] = self.prop_vars["x"].get()
            el["y"] = self.prop_vars["y"].get()
            el["size"] = self.prop_vars["size"].get()
            el["w"] = self.prop_vars["w"].get()
            el["h"] = self.prop_vars["h"].get()
            el["fill_color"] = self.prop_vars["fill_color"].get()
            el["hl_color"] = self.prop_vars["hl_color"].get()
            el["base_color"] = self.prop_vars["base_color"].get()
        except tk.TclError:
            pass 
        self.update_listbox()
        self.redraw_canvas()

    def redraw_canvas(self):
        self.canvas.delete("all")
        
        scale = self.view_scale.get()
        
        bg_path = self.bg_image_path.get()
        if bg_path and os.path.exists(bg_path):
            try:
                pil_img = Image.open(bg_path).convert("RGBA")
                if scale != 1.0:
                    pil_img = pil_img.resize((int(pil_img.width * scale), int(pil_img.height * scale)), Image.Resampling.LANCZOS)
                self.bg_photo = ImageTk.PhotoImage(pil_img)
                self.canvas.create_image(0, 0, image=self.bg_photo, anchor="nw", tags="bg")
            except Exception: pass

        alias_map = {
            "LEFT_SHOULDER": "LB",
            "RIGHT_SHOULDER": "RB",
            "LEFT_THUMB": "L3",
            "RIGHT_THUMB": "R3",
            "DPAD_UP": "D_UP",
            "DPAD_DOWN": "D_DN",
            "DPAD_LEFT": "D_LF",
            "DPAD_RIGHT": "D_RT",
            "joystick": "Stick"
        }

        for i, el in enumerate(self.elements):
            x = int(el.get("x", 100) * scale)
            y = int(el.get("y", 100) * scale)
            
            color = "#00FF55" if i == self.selected_idx else "#FFFFFF"
            tags = ("element", f"elem_{i}")
            
            display_name = alias_map.get(el["id"], el["id"])
            font_size = max(6, int(8 * scale))

            if el["type"] in ["glyph", "stick", "circle"]:
                r = int(el.get("size", 15) * scale)
                if el["type"] == "stick":
                    base_c = el.get("base_color", "")
                    fill_c = el.get("fill_color", "")
                    self.canvas.create_oval(x-r, y-r, x+r, y+r, outline=color, fill=base_c, width=2, tags=tags)
                    ball_r = r * 0.6
                    self.canvas.create_oval(x-ball_r, y-ball_r, x+ball_r, y+ball_r, outline=color, fill=fill_c, width=2, tags=tags)
                    self.canvas.create_text(x, y, text=display_name, fill=color if not fill_c else "#FFFFFF", tags=tags, font=("Arial", font_size, "bold"))
                elif el["type"] == "circle":
                    fill_c = el.get("fill_color", "")
                    self.canvas.create_oval(x-r, y-r, x+r, y+r, outline=color, fill=fill_c, width=2, tags=tags)
                    self.canvas.create_text(x, y, text=display_name, fill=color if not fill_c else "#FFFFFF", tags=tags, font=("Arial", font_size, "bold"))
                elif el["type"] == "glyph":
                    base_c = el.get("base_color", "")
                    self.canvas.create_oval(x-r, y-r, x+r, y+r, outline=color, fill=base_c, width=2, tags=tags)
                    self.canvas.create_text(x, y, text=display_name, fill=color if not base_c else "#FFFFFF", tags=tags, font=("Arial", font_size, "bold"))
            elif el["type"] == "rect":
                w = int(el.get("w", 20) * scale)
                h = int(el.get("h", 20) * scale)
                fill_c = el.get("fill_color", "")
                self.canvas.create_rectangle(x, y, x+w, y+h, outline=color, fill=fill_c, width=2, tags=tags)
                self.canvas.create_text(x+w/2, y+h/2, text=display_name, fill=color if not fill_c else "#FFFFFF", tags=tags, font=("Arial", font_size, "bold"))

    def on_canvas_click(self, event):
        items = self.canvas.find_withtag("current")
        for item in items:
            tags = self.canvas.gettags(item)
            for tag in tags:
                if tag.startswith("elem_"):
                    self.selected_idx = int(tag.split("_")[1])
                    self.update_listbox()
                    self.load_props_from_element()
                    self.redraw_canvas()
                    
                    self.drag_data["item"] = self.selected_idx
                    self.drag_data["start_ex"] = event.x
                    self.drag_data["start_ey"] = event.y
                    self.drag_data["start_el_x"] = self.elements[self.selected_idx]["x"]
                    self.drag_data["start_el_y"] = self.elements[self.selected_idx]["y"]
                    return
                    
        self.selected_idx = None
        self.drag_data["item"] = None
        self.update_listbox()
        self.redraw_canvas()

    def on_canvas_drag(self, event):
        if self.drag_data["item"] is not None:
            scale = self.view_scale.get()
            el = self.elements[self.drag_data["item"]]
            
            dx = (event.x - self.drag_data["start_ex"]) / scale
            dy = (event.y - self.drag_data["start_ey"]) / scale
            
            el["x"] = int(self.drag_data["start_el_x"] + dx)
            el["y"] = int(self.drag_data["start_el_y"] + dy)
            
            if self.selected_idx == self.drag_data["item"]:
                self._updating_props = True 
                self.prop_vars["x"].set(el["x"])
                self.prop_vars["y"].set(el["y"])
                self._updating_props = False
                
            self.redraw_canvas()

    def save_layout(self):
        name = self.layout_name.get().strip()
        if not name:
            messagebox.showerror("Error", "Layout needs a name.")
            return
            
        layout_data = {
            "name": name,
            "bg_image": self.bg_image_path.get(),
            "elements": self.elements
        }
        
        layouts_dir = os.path.join(get_base_dir(), "Presets", "Layouts")
        os.makedirs(layouts_dir, exist_ok=True)
        
        filepath = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON Files", "*.json")],
            initialdir=layouts_dir,
            initialfile=f"{name}.json",
            title="Save Layout As..."
        )
        
        if filepath:
            try:
                with open(filepath, "w") as f:
                    json.dump(layout_data, f, indent=4)
                messagebox.showinfo("Success", f"Layout '{name}' saved successfully!")
                self.app.load_custom_layouts() 
                self.destroy()
            except Exception as e:
                messagebox.showerror("Save Error", str(e))

    def delete_layout(self):
        name = self.layout_name.get().strip()
        if not name: return
        
        filepath = None
        if hasattr(self.app, 'custom_layouts') and name in self.app.custom_layouts:
            filepath = self.app.custom_layouts[name].get("_filepath")
            
        # Fallback if it somehow isn't in the loaded dictionary
        if not filepath:
            filepath = os.path.join(get_base_dir(), "Presets", "Layouts", f"{name}.json")
            
        if os.path.exists(filepath):
            if messagebox.askyesno("Confirm Delete", f"Are you sure you want to permanently delete '{name}'?"):
                try:
                    os.remove(filepath)
                    messagebox.showinfo("Deleted", f"Layout '{name}' has been deleted.")
                    self.app.load_custom_layouts()
                    self.destroy()
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to delete: {e}")
        else:
            messagebox.showwarning("Not Found", "This layout does not exist on disk yet.")

class ComboTrackerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("FG Combo Builder & Manager")
        self.geometry("1100x750") 
        try:
            self.state('zoomed')
        except tk.TclError:
            self.attributes('-zoomed', True)
        self._is_loading = True 
        
        self.dummy_pixel = tk.PhotoImage(width=1, height=1)
        self.palette_widgets = [] 
        self.standard_btns = []
        self.grad_cache = {}
        self._keep_alive_images = {}
        self.icon_pil_cache = {}
        self.icon_photo_cache = {}
        
        self.btn_history = []
        self.dir_history = []
        
        self.custom_glyph_configs = {}
        self.custom_layouts = {}
        
        base_dir = get_base_dir()
        self.settings_file = os.path.join(base_dir, "settings.ini")
        
        self.config = configparser.ConfigParser()
        self.load_settings()
        
        self.current_theme = tk.StringVar(value="Dark") 
        self.active_theme_file = self.config.get("Settings", "ThemeFile", fallback="")
        self.active_theme_data = {"bg": "#0F0F0F", "highlight": "#505050", "font": "#FFFFFF", "entry_bg": "#1E1F20", "btn_bg": "#1E1F20", "palette_style": "Classic"}
        
        self.current_glyph = tk.StringVar(value=self.config.get("Settings", "Glyph", fallback="Default"))
        self.modern_overlay_var = tk.BooleanVar(value=self.config.getboolean("Settings", "ModernOverlay", fallback=False))
        self.pin_alpha_var = tk.StringVar(value=self.config.get("Settings", "PinAlpha", fallback="85"))
        self.controller_scale_var = tk.StringVar(value=self.config.get("Settings", "ControllerScale", fallback="1.0"))
        self.viewer_outline_width_var = tk.StringVar(value=self.config.get("Settings", "ViewerOutlineWidth", fallback="2"))
        self.viewer_highlight_width_var = tk.StringVar(value=self.config.get("Settings", "ViewerHighlightWidth", fallback="4"))
        self.active_gamepad_val = tk.StringVar(value="Off")
        
        self.viewer_layout_var = tk.StringVar(value="Off")
        self.viewer_transparent_var = tk.BooleanVar(value=self.config.getboolean("Settings", "ViewerTransparent", fallback=True))
        self.viewer_bg_image_var = tk.BooleanVar(value=self.config.getboolean("Settings", "ViewerBgImage", fallback=False))
        self.gamepad_viewer = None
        
        self.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        self.bind_all("<MouseWheel>", self._on_mousewheel)
        self.bind_all("<Button-4>", self._on_mousewheel)
        self.bind_all("<Button-5>", self._on_mousewheel)
        self.bind_all("<Button-1>", self._on_global_click, add="+")
        
        self.data = {"P1": self.init_player_data(), "P2": self.init_player_data()}
        
        self.blink_on = True
        self.raw_images = {}      
        self.base_icon_size = 40   
        
        if XINPUT_AVAILABLE:
            self.last_pad_states = {}
            self.dir_buffer = set()
            self.dir_window_start = None
            self.btn_buffer = set()
            self.btn_window_start = None
            self.current_held_dir = None
            self.dir_hold_start = None
            self.dir_charged = False
            self.btn_hold_starts = {}
            self.btn_charged = {}
            self.last_committed_dir = None
            self.dir_stable_start = None
            self.after(20, self.poll_gamepad)
            self.after(1000, self.poll_connected_controllers)
        else:
            self.after(500, lambda: messagebox.showwarning("Missing Library", 
                "The XInput wrapper requires an external library to read your gamepad.\n\n"
                "Please run:\npython -m pip install XInput-Python\n\n"
                "The Gamepad feature will be disabled for now."))
        
        self.setup_preset_directories()
        self.load_custom_glyphs()
        
        if self.active_theme_file and os.path.exists(self.active_theme_file):
            self.load_theme(self.active_theme_file, apply=False)

        self.load_images()
        self.pre_cache_ui_images()
        self.setup_ui()
        self.apply_theme()
        
        self.load_custom_layouts()
        
        self._is_loading = False 
        self.animate_cursor()

    def is_input_blocked(self):
        return getattr(self, 'gamepad_viewer', None) and self.gamepad_viewer.winfo_exists()

    def on_viewer_layout_change(self):
        layout = self.viewer_layout_var.get()
        if layout == "Off":
            if hasattr(self, 'gamepad_viewer') and self.gamepad_viewer and self.gamepad_viewer.winfo_exists():
                self.gamepad_viewer.destroy()
                self.gamepad_viewer = None
        else:
            try: scale = float(self.controller_scale_var.get())
            except ValueError: scale = 1.0
            
            if hasattr(self, 'gamepad_viewer') and self.gamepad_viewer and self.gamepad_viewer.winfo_exists():
                self.gamepad_viewer.layout_name = layout
                self.gamepad_viewer.scale = scale
                self.gamepad_viewer.build_layout()
            else:
                self.gamepad_viewer = GamepadViewerWindow(self, layout, scale)

    def on_viewer_bg_change(self):
        if hasattr(self, 'gamepad_viewer') and self.gamepad_viewer and self.gamepad_viewer.winfo_exists():
            self.gamepad_viewer.apply_transparency()
            self.gamepad_viewer.build_layout() 

    def load_custom_glyphs(self):
        user_dir = os.path.join(get_base_dir(), "icons", "User")
        if not os.path.exists(user_dir): return
        
        for pack in os.listdir(user_dir):
            pack_path = os.path.join(user_dir, pack)
            if os.path.isdir(pack_path):
                config_path = os.path.join(pack_path, "config.json")
                if os.path.exists(config_path):
                    try:
                        with open(config_path, 'r') as f:
                            cfg = json.load(f)
                            name = cfg.get("name", pack)
                            self.custom_glyph_configs[name] = cfg
                            GLYPH_SUFFIXES[name] = (cfg.get("suffix", ""), *cfg.get("macros", []))
                    except Exception as e:
                        print(f"Failed to load custom glyph config {config_path}: {e}")
                        
        if getattr(self, "glyph_menu", None):
            self.setup_glyph_menu()

    def load_custom_layouts(self):
        self.custom_layouts = {}
        if not hasattr(self, 'layouts_dir') or not self.layouts_dir: return
        
        for root, dirs, files in os.walk(self.layouts_dir):
            for file in files:
                if file.endswith(".json"):
                    filepath = os.path.join(root, file)
                    rel_dir = os.path.relpath(root, self.layouts_dir)
                    if rel_dir == ".": 
                        rel_dir = ""
                        
                    try:
                        with open(filepath, 'r') as f:
                            data = json.load(f)
                            name = data.get("name", file[:-5])
                            # Inject pathing data for the dynamic menu builder
                            data["_rel_dir"] = rel_dir
                            data["_filepath"] = filepath
                            self.custom_layouts[name] = data
                    except Exception as e:
                        print(f"Failed to load layout {file}: {e}")
                        
        self.populate_layouts_menus()

    def populate_layouts_menus(self):
        if not hasattr(self, 'viewer_menu'): return
        
        self.viewer_menu.delete(0, 'end')
        self.viewer_menu.add_radiobutton(label="Off", variable=self.viewer_layout_var, value="Off", command=self.on_viewer_layout_change)
        self.viewer_menu.add_separator()
        
        # Cache for our dynamically generated cascade menus
        menus = {"": self.viewer_menu}
        
        def get_or_create_menu(rel_path):
            if rel_path in menus: 
                return menus[rel_path]
            
            parts = rel_path.replace('\\', '/').split('/')
            parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
            parent_menu = get_or_create_menu(parent_path)
            
            new_menu = tk.Menu(parent_menu, tearoff=0)
            parent_menu.add_cascade(label=parts[-1], menu=new_menu)
            menus[rel_path] = new_menu
            return new_menu
            
        # Sort layouts alphabetically by their folder path, then by name
        sorted_layouts = sorted(self.custom_layouts.items(), key=lambda x: (x[1].get("_rel_dir", ""), x[0]))
        
        for name, data in sorted_layouts:
            rel_dir = data.get("_rel_dir", "")
            parent_menu = get_or_create_menu(rel_dir.replace('\\', '/'))
            parent_menu.add_radiobutton(label=name, variable=self.viewer_layout_var, value=name, command=self.on_viewer_layout_change)
            
        self.viewer_menu.add_separator()
        self.viewer_menu.add_command(label="🛠 Layout Builder", command=lambda: GamepadLayoutBuilderWindow(self))
        self.viewer_menu.add_separator()
        self.viewer_menu.add_checkbutton(label="Transparent Background", variable=self.viewer_transparent_var, command=self.on_viewer_bg_change)
        self.viewer_menu.add_checkbutton(label="Show Controller Image", variable=self.viewer_bg_image_var, command=self.on_viewer_layout_change)

    def _on_global_click(self, event):
        w = event.widget
        if not w: return
        
        if hasattr(self, 'left_panel') and str(w).startswith(str(self.left_panel)):
            return
            
        for p in ["P1", "P2"]:
            if w in self.data[p]["canvases"] or w in self.data[p]["scrollbars"]:
                return
            if hasattr(self, f"vsb_{p}") and w == getattr(self, f"vsb_{p}"):
                return
                
        self.clear_all_cursors()

    def is_dir(self, tok):
        glyph = self.current_glyph.get()
        if glyph in ["Tekken", "Tekken 3"] and tok in {'qcb', 'qcf', 'hcb', 'hcf', '360', 'dp', 'rdp'}:
            return False
        return tok in DIRECTIONS

    def is_atk(self, tok):
        glyph = self.current_glyph.get()
        if glyph in ["Tekken", "Tekken 3"] and tok in {'qcb', 'qcf', 'hcb', 'hcf', '360', 'dp', 'rdp'}:
            return True
        return tok in ATTACKS

    def lighten_colors(self, colors, amount=40):
        res = []
        for c in colors:
            try:
                r = min(255, max(0, int(c[1:3], 16) + amount))
                g = min(255, max(0, int(c[3:5], 16) + amount))
                b = min(255, max(0, int(c[5:7], 16) + amount))
                res.append(f"#{r:02x}{g:02x}{b:02x}")
            except (ValueError, IndexError):
                res.append(c)
        return res

    def compile_theme_data(self, data):
        compiled = data.copy()
        compiled["palette_style"] = compiled.get("palette_style", "Classic")
        
        if "bg_grad" in compiled:
            rgbs = [tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) for h in compiled["bg_grad"]]
            avg_rgb = [sum(c)/4.0 for c in zip(*rgbs)]
            lum = (0.299 * avg_rgb[0] + 0.587 * avg_rgb[1] + 0.114 * avg_rgb[2]) / 255.0
            
            auto_font = "#000000" if lum > 0.5 else "#FFFFFF"
            auto_bg = '#{:02x}{:02x}{:02x}'.format(*[max(0, int(c-15)) if lum > 0.5 else min(255, int(c+15)) for c in avg_rgb])
            auto_entry = '#{:02x}{:02x}{:02x}'.format(*[max(0, int(c-30)) if lum > 0.5 else min(255, int(c+30)) for c in avg_rgb])
            auto_hl = '#{:02x}{:02x}{:02x}'.format(*[max(0, int(c-60)) if lum > 0.5 else min(255, int(c+60)) for c in avg_rgb])
            
            if compiled.get("ui_bg_mode") == "Custom":
                compiled["bg"] = compiled.get("bg", auto_bg)
                compiled["entry_bg"] = compiled.get("entry_bg", auto_entry)
                compiled["btn_bg"] = compiled.get("btn_bg", compiled["entry_bg"])
                compiled["highlight"] = compiled.get("highlight", auto_hl)
                compiled["font"] = compiled.get("font", auto_font)
            else:
                compiled["bg"] = auto_bg
                compiled["entry_bg"] = auto_entry
                compiled["btn_bg"] = auto_entry
                compiled["highlight"] = auto_hl
                compiled["font"] = auto_font
        else:
            compiled["bg"] = compiled.get("bg", "#0F0F0F")
            compiled["font"] = compiled.get("font", "#FFFFFF")
            compiled["highlight"] = compiled.get("highlight", "#505050")
            compiled["entry_bg"] = compiled.get("entry_bg", "#1E1F20")
            compiled["btn_bg"] = compiled.get("btn_bg", compiled["entry_bg"])
            
        return compiled

    def get_gradient_pil(self, w, h, colors):
        cache_key = (w, h, tuple(colors))
        if cache_key in self.grad_cache:
            return self.grad_cache[cache_key].copy()
            
        img = Image.new("RGB", (2, 2))
        rgbs = [tuple(int(c.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) for c in colors]
        img.putpixel((0, 0), rgbs[0])
        img.putpixel((1, 0), rgbs[1])
        img.putpixel((0, 1), rgbs[2])
        img.putpixel((1, 1), rgbs[3])
        img = img.resize((w, h), Image.Resampling.BICUBIC)
        
        self.grad_cache[cache_key] = img
        return img.copy()

    def _on_mousewheel(self, event):
        widget = event.widget
        if isinstance(widget, str):
            try:
                widget = self.nametowidget(widget)
            except KeyError:
                return
                
        if not hasattr(widget, 'winfo_toplevel') or widget.winfo_toplevel() != self:
            return
            
        try:
            p = self.get_active_player()
            canvas = self.data[p]["main_canvas"]
            
            if event.delta:
                delta = -1 if event.delta > 0 else 1
                if abs(event.delta) >= 120:
                    delta = int(-1 * (event.delta / 120))
                canvas.yview_scroll(delta, "units")
            elif event.num == 4:
                canvas.yview_scroll(-1, "units")
            elif event.num == 5:
                canvas.yview_scroll(1, "units")
        except Exception:
            pass

    def on_closing(self):
        self.save_settings()
        self.destroy()

    def poll_connected_controllers(self):
        if not XINPUT_AVAILABLE: return
        connected = XInput.get_connected()
        menu = self.gamepad_menu
        menu.delete(0, 'end')
        menu.add_command(label="Off", command=lambda: self.active_gamepad_val.set("Off"))
        for i in range(4):
            status = "Active" if connected[i] else "Disconnected"
            label = f"Controller {i+1} ({status})"
            menu.add_command(label=label, command=lambda l=label: self.active_gamepad_val.set(l))
            current_sel = self.active_gamepad_val.get()
            if current_sel.startswith(f"Controller {i+1}") and current_sel != label:
                self.active_gamepad_val.set(label)
        self.after(2000, self.poll_connected_controllers)

    def get_dpad_state(self, state, l_thumb=(0,0)):
        up = state.get('DPAD_UP', False)
        down = state.get('DPAD_DOWN', False)
        left = state.get('DPAD_LEFT', False)
        right = state.get('DPAD_RIGHT', False)
        
        lx, ly = l_thumb
        if ly > 0.5: up = True
        elif ly < -0.5: down = True
        if lx < -0.5: left = True
        elif lx > 0.5: right = True
        
        if up and left: return 'upleft'
        elif up and right: return 'upright'
        elif down and left: return 'downleft'
        elif down and right: return 'downright'
        elif up: return 'up'
        elif down: return 'down'
        elif left: return 'left'
        elif right: return 'right'
        return None

    def poll_gamepad(self):
        if not XINPUT_AVAILABLE or self.active_gamepad_val.get() == "Off" or "(Disconnected)" in self.active_gamepad_val.get():
            self.after(1, self.poll_gamepad)
            return
        pad_id = int(self.active_gamepad_val.get().split()[1]) - 1
        try:
            state = XInput.get_state(pad_id)
            buttons = XInput.get_button_values(state)
            lt, rt = XInput.get_trigger_values(state)
            
            thumbs = XInput.get_thumb_values(state) if hasattr(XInput, 'get_thumb_values') else ((0,0), (0,0))
            l_thumb, r_thumb = thumbs[0], thumbs[1]
            
            current_state = buttons.copy()
            current_state['LT'] = lt > 0.5
            current_state['RT'] = rt > 0.5
            
            rx, ry = r_thumb
            current_state['R_STICK_UP'] = ry > 0.5
            current_state['R_STICK_DOWN'] = ry < -0.5
            current_state['R_STICK_LEFT'] = rx < -0.5
            current_state['R_STICK_RIGHT'] = rx > 0.5
            
            lx, ly = l_thumb
            current_state['L_STICK_UP'] = ly > 0.5
            current_state['L_STICK_DOWN'] = ly < -0.5
            current_state['L_STICK_LEFT'] = lx < -0.5
            current_state['L_STICK_RIGHT'] = lx > 0.5
            
            current_dir = self.get_dpad_state(current_state, l_thumb)

            if getattr(self, 'gamepad_viewer', None) and self.gamepad_viewer.winfo_exists():
                self.gamepad_viewer.update_inputs(current_state, current_dir, l_thumb, r_thumb)

            if pad_id not in self.last_pad_states:
                self.last_pad_states[pad_id] = current_state
                self.after(1, self.poll_gamepad)
                return
                
            last_state = self.last_pad_states[pad_id]
            btn_pressed = False
            last_dir = self.get_dpad_state(last_state, l_thumb)
            
            if current_dir != last_dir:
                self.dir_stable_start = time.perf_counter() if current_dir else None
                self.last_committed_dir = None
            if current_dir and self.dir_stable_start:
                if time.perf_counter() - self.dir_stable_start >= 0.015:
                    if self.last_committed_dir != current_dir:
                        self._inject_tokens([current_dir])
                        self.last_committed_dir = current_dir
                        
                        self.dir_history.append((current_dir, time.perf_counter()))
                        self.dir_history = self.dir_history[-30:] 
                        
            for btn, is_pressed in current_state.items():
                if is_pressed and not last_state.get(btn, False):
                    if btn not in ['DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT']:
                        self.btn_buffer.add(btn)
                        btn_pressed = True
            if btn_pressed and self.btn_window_start is None:
                self.btn_window_start = time.perf_counter()
            if current_dir != self.current_held_dir:
                self.current_held_dir = current_dir
                self.dir_hold_start = time.perf_counter() if current_dir else None
                self.dir_charged = False
            if self.dir_hold_start and not self.dir_charged:
                if time.perf_counter() - self.dir_hold_start >= 0.75:
                    self.dir_charged = True
                    self.mutate_last_token(self.current_held_dir, f"c_{self.current_held_dir}")
            
            BTN_MAP = {'X': 'lp', 'Y': 'mp', 'RIGHT_SHOULDER': 'hp', 'A': 'lk', 'B': 'mk', 'RT': 'hk', 'LEFT_SHOULDER': 'any_p', 'LT': 'any_k',
                       'START': 'start', 'BACK': 'select', 'LEFT_THUMB': 'l3', 'RIGHT_THUMB': 'r3'}
            for pad_btn, tok in BTN_MAP.items():
                if current_state.get(pad_btn, False):
                    if not self.btn_hold_starts.get(pad_btn):
                        self.btn_hold_starts[pad_btn] = time.perf_counter()
                        self.btn_charged[pad_btn] = False
                    elif not self.btn_charged.get(pad_btn) and time.perf_counter() - self.btn_hold_starts[pad_btn] >= 0.75:
                        self.btn_charged[pad_btn] = True
                        self.mutate_last_token(tok, f"h_{tok}")
                else:
                    self.btn_hold_starts[pad_btn] = None
            self.last_pad_states[pad_id] = current_state
        except XInput.XInputNotConnectedError:
            pass 
        if self.btn_window_start is not None and (time.perf_counter() - self.btn_window_start) >= 0.083:
            self.flush_btn_buffer()
            self.btn_window_start = None
            self.btn_buffer.clear()
        self.after(1, self.poll_gamepad)
        
    def mutate_last_token(self, old_token, new_token):
        if self.is_input_blocked(): return
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        for i in range(len(combo) - 1, -1, -1):
            if combo[i] == old_token:
                combo[i] = new_token
                self.refresh_displays(p, idx)
                break
        
    def flush_btn_buffer(self):
        buf = self.btn_buffer
        if not buf: return
        
        raw_attacks = []
        if 'X' in buf: raw_attacks.append('X')
        if 'Y' in buf: raw_attacks.append('Y')
        if 'RIGHT_SHOULDER' in buf: raw_attacks.append('RIGHT_SHOULDER')
        if 'A' in buf: raw_attacks.append('A')
        if 'B' in buf: raw_attacks.append('B')
        if 'RT' in buf: raw_attacks.append('RT')
        if 'LEFT_SHOULDER' in buf: raw_attacks.append('LEFT_SHOULDER')
        if 'LT' in buf: raw_attacks.append('LT')
        if 'START' in buf: raw_attacks.append('START')
        if 'BACK' in buf: raw_attacks.append('BACK')
        if 'LEFT_THUMB' in buf: raw_attacks.append('LEFT_THUMB')
        if 'RIGHT_THUMB' in buf: raw_attacks.append('RIGHT_THUMB')
        
        current_time = time.perf_counter()
        
        if raw_attacks:
            self.btn_history.append((set(raw_attacks), current_time))
            self.btn_history = [h for h in self.btn_history if current_time - h[1] < 2.0]
            
        glyph = self.current_glyph.get()
        style_suffix = GLYPH_SUFFIXES.get(glyph, ("",))[0].lower()
        
        attacks = []
        tokens_to_insert = []
        active = set(raw_attacks)
        
        if glyph in self.custom_glyph_configs:
            custom_map = self.custom_glyph_configs[glyph].get("mappings", {})
            sorted_map = sorted(custom_map.items(), key=lambda x: len(x[1].split('+')), reverse=True)
            
            for atk, mapping in sorted_map:
                req_btns = set(mapping.split('+'))
                if req_btns and req_btns.issubset(active):
                    attacks.append(atk)
                    active -= req_btns
                    
        else:
            default_map = {
                'X': 'lp', 'Y': 'mp', 'RIGHT_SHOULDER': 'hp', 'A': 'lk', 'B': 'mk', 'RT': 'hk', 'LEFT_SHOULDER': 'any_p', 'LT': 'any_k',
                'START': 'start', 'BACK': 'select', 'LEFT_THUMB': 'l3', 'RIGHT_THUMB': 'r3'
            }
            active_standard = {default_map[b] for b in active if b in default_map}
            active = active_standard
            
            if glyph in ["Tekken", "Tekken 3"]:
                active -= {'hp', 'hk', 'any_p', 'any_k'}
                
                if {'lk', 'mk', 'mp'}.issubset(active):
                    tokens_to_insert.append('hcf')
                    active -= {'lk', 'mk', 'mp'}
                elif {'lk', 'lp', 'mp'}.issubset(active):
                    tokens_to_insert.append('hcb')
                    active -= {'lk', 'lp', 'mp'}
                elif {'lp', 'mp', 'mk'}.issubset(active):
                    tokens_to_insert.append('rdp')
                    active -= {'lp', 'mp', 'mk'}
                elif {'lp', 'lk', 'mk'}.issubset(active):
                    tokens_to_insert.append('dp')
                    active -= {'lp', 'lk', 'mk'}
                elif {'mp', 'mk'}.issubset(active):
                    tokens_to_insert.append('qcf')
                    active -= {'mp', 'mk'}
                elif {'lp', 'lk'}.issubset(active):
                    tokens_to_insert.append('qcb')
                    active -= {'lp', 'lk'}
                
                if {'lp', 'mp'}.issubset(active):
                    attacks.append('hp')
                    active -= {'lp', 'mp'}
                if {'lk', 'mk'}.issubset(active):
                    attacks.append('hk')
                    active -= {'lk', 'mk'}
                if {'lp', 'mk'}.issubset(active):
                    attacks.append('any_p')
                    active -= {'lp', 'mk'}
                if {'lk', 'mp'}.issubset(active):
                    attacks.append('any_k')
                    active -= {'lk', 'mp'}
                    
                for a in ['lp', 'mp', 'lk', 'mk', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)
                    
            elif glyph == "Soul Calibur":
                active -= {'hp', 'hk', 'any_p', 'any_k'}
                is_slide = False
                if len(self.btn_history) >= 2:
                    prev_btns, prev_time = self.btn_history[-2]
                    if current_time - prev_time < 0.2 and prev_btns:
                        is_slide = True
                if is_slide:
                    if 'lp' in active:
                        attacks.append('hp')
                        active -= {'lp'}
                    elif 'mp' in active:
                        attacks.append('hk')
                        active -= {'mp'}
                    elif 'mk' in active:
                        attacks.append('any_p')
                        active -= {'mk'}
                for a in ['lp', 'mp', 'lk', 'mk', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)
                    
            elif glyph == "BlazBlue":
                active -= {'any_p', 'any_k'}
                if {'lp', 'mp', 'lk', 'mk'}.issubset(active):
                    attacks.append('any_k')
                    active -= {'lp', 'mp', 'lk', 'mk'}
                elif {'lp', 'mp', 'mk'}.issubset(active):
                    attacks.append('any_p')
                    active -= {'lp', 'mp', 'mk'}
                for a in ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)
                    
            elif glyph == "Persona 4":
                active -= {'any_p', 'any_k'}
                if {'lp', 'lk', 'mk'}.issubset(active):
                    attacks.append('any_p')
                    active -= {'lp', 'lk', 'mk'}
                elif {'lp', 'mp', 'mk'}.issubset(active):
                    attacks.append('any_k')
                    active -= {'lp', 'mp', 'mk'}
                for a in ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)
                    
            elif glyph == "FighterZ":
                active -= {'any_p', 'any_k'}
                if {'lp', 'mp', 'lk', 'mk'}.issubset(active):
                    attacks.append('any_k')
                    active -= {'lp', 'mp', 'lk', 'mk'}
                elif {'lk', 'mk'}.issubset(active):
                    attacks.append('any_p')
                    active -= {'lk', 'mk'}
                for a in ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)
                    
            elif glyph == "SNK":
                active -= {'hp', 'hk', 'any_p', 'any_k'}
                recent_dirs = [d[0] for d in getattr(self, 'dir_history', []) if current_time - d[1] < 1.5]
                def has_subseq(seq, sub):
                    it = iter(seq)
                    return all(any(x == y for x in it) for y in sub)
                is_pretzel = has_subseq(recent_dirs, ['downleft', 'right', 'downright', 'down', 'downleft', 'left', 'downright'])
                is_shokoken = has_subseq(recent_dirs, ['right', 'left', 'downleft', 'down', 'downright', 'right'])
                is_overkill = has_subseq(recent_dirs, ['right', 'downright', 'down', 'downleft', 'left', 'downleft', 'down', 'downright', 'right'])
                recent_mashes = [b[0] for b in getattr(self, 'btn_history', []) if current_time - b[1] < 1.5]
                is_mashed = len(recent_mashes) >= 5
                
                if is_pretzel:
                    attacks.append('any_k')
                    self.dir_history.clear()
                    active.clear()
                elif is_shokoken:
                    attacks.append('any_p')
                    self.dir_history.clear()
                    active.clear()
                elif is_overkill:
                    attacks.append('hk')
                    self.dir_history.clear()
                    active.clear()
                elif is_mashed:
                    attacks.append('hp')
                    self.btn_history.clear()
                    active.clear()
                for a in ['lp', 'mp', 'lk', 'mk', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)
            else:
                for a in ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3']:
                    if a in active: attacks.append(a)

        if tokens_to_insert and attacks:
            tokens_to_insert.append('plus')
            
        for i, atk in enumerate(attacks):
            if i > 0:
                tokens_to_insert.append('plus')
            tokens_to_insert.append(atk)
            
        self._inject_tokens(tokens_to_insert)

    def _inject_tokens(self, tokens_to_insert):
        if self.is_input_blocked(): return
        if not tokens_to_insert: return
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        ins_pos = c_idx if c_idx is not None else len(combo)
        if ins_pos > 0:
            prev = combo[ins_pos - 1]
            first = tokens_to_insert[0]
            if self.is_dir(first):
                if self.is_atk(prev):
                    combo.insert(ins_pos, 'goes_into')
                    ins_pos += 1
            elif self.is_atk(first):
                if self.is_dir(prev):
                    combo.insert(ins_pos, 'plus')
                    ins_pos += 1
                elif self.is_atk(prev):
                    combo.insert(ins_pos, 'goes_into')
                    ins_pos += 1
        for token in tokens_to_insert:
            combo.insert(ins_pos, token)
            ins_pos += 1
        if self.data[p]["cursors"][idx] is not None: 
            self.data[p]["cursors"][idx] = ins_pos
        self.refresh_displays(p, idx)
        self.scroll_to_cursor(p, idx)

    def pre_cache_ui_images(self):
        tokens = set(TEXT_MAP.keys())
        for atk in BASE_ATTACKS:
            tokens.add(atk)
            tokens.add(f"h_{atk}")
        for d in CARDINALS:
            tokens.add(d)
            tokens.add(f"c_{d}")
        for m in ["drc", "qcf", "qcb", "dp", "rdp", "hcf", "hcb", "plus", "goes_into", "newline"]:
            tokens.add(m)
        ui_scales = [0.5, 0.6, 0.75]
        original_glyph = self.current_glyph.get()
        for glyph_name in GLYPH_SUFFIXES.keys():
            self.icon_precache_matrix(glyph_name, tokens, ui_scales)
        self.current_glyph.set(original_glyph)
        
    def icon_precache_matrix(self, glyph_name, tokens, ui_scales):
        style_suffix = GLYPH_SUFFIXES.get(glyph_name, ("",))[0].lower()
        for t in tokens:
            for s in ui_scales:
                self.get_icon_pil(t, scale_factor=s, is_pinned=False, override_suffix=style_suffix)
            self.get_icon_pil(t, scale_factor=1.0, is_pinned=True, override_suffix=style_suffix)
            
        if style_suffix in ["_tk", "_t3"]:
            for t in tokens:
                for s in ui_scales:
                    self.get_icon_pil(t, scale_factor=s, is_pinned=False, override_suffix=style_suffix, is_macro=True)
                self.get_icon_pil(t, scale_factor=1.0, is_pinned=True, override_suffix=style_suffix, is_macro=True)

    def load_settings(self):
        try:
            if os.path.exists(self.settings_file):
                self.config.read(self.settings_file)
            if not self.config.has_section("Settings"):
                self.config.add_section("Settings")
        except Exception:
            if not self.config.has_section("Settings"):
                self.config.add_section("Settings")
            
    def save_settings(self):
        if getattr(self, '_is_loading', False): return
        if not self.config.has_section("Settings"):
            self.config.add_section("Settings")
        self.config.set("Settings", "ThemeFile", self.active_theme_file)
        self.config.set("Settings", "Glyph", self.current_glyph.get())
        self.config.set("Settings", "ModernOverlay", str(self.modern_overlay_var.get()))
        self.config.set("Settings", "PinAlpha", str(self.pin_alpha_var.get()))
        self.config.set("Settings", "ControllerScale", str(self.controller_scale_var.get()))
        self.config.set("Settings", "ViewerOutlineWidth", str(self.viewer_outline_width_var.get()))
        self.config.set("Settings", "ViewerHighlightWidth", str(self.viewer_highlight_width_var.get()))
        self.config.set("Settings", "ViewerTransparent", str(self.viewer_transparent_var.get()))
        self.config.set("Settings", "ViewerBgImage", str(self.viewer_bg_image_var.get()))
        try:
            with open(self.settings_file, "w") as f:
                self.config.write(f)
        except Exception:
            pass
            
    def setup_preset_directories(self):
        try:
            base_dir = get_base_dir()
            self.combos_dir = os.path.join(base_dir, "Presets", "Combos")
            self.cmd_lists_dir = os.path.join(base_dir, "Presets", "Command Lists")
            self.themes_dir = os.path.join(base_dir, "Presets", "Themes")
            self.layouts_dir = os.path.join(base_dir, "Presets", "Layouts")
            os.makedirs(self.combos_dir, exist_ok=True)
            os.makedirs(self.cmd_lists_dir, exist_ok=True)
            os.makedirs(self.themes_dir, exist_ok=True)
            os.makedirs(self.layouts_dir, exist_ok=True)
            install_default_layouts(self.layouts_dir)
        except Exception:
            self.combos_dir = ""
            self.cmd_lists_dir = ""
            self.themes_dir = ""
            self.layouts_dir = ""
            
    def init_player_data(self):
        return {
            "combos": [],
            "combo_texts": [],
            "pinned_vars": [],
            "pinned_windows": [],
            "justify_pins": tk.BooleanVar(value=True),
            "current_scale": tk.StringVar(value="1.0"),
            "master_pinned_window": None,
            "active_slot": tk.IntVar(value=0),
            "cursors": [],
            "cursor_widgets": [],
            "canvases": [],
            "scrollbars": [],
            "row_frames": [],
            "slot_count_var": tk.StringVar(value="15"),
            "tree_canvas": None,
            "rows_container": None,
            "token_bboxes": {},
            "images": {}
        }

    def get_active_player(self):
        try:
            return "P1" if self.notebook.index("current") == 0 else "P2"
        except tk.TclError:
            return "P1"

    def load_images(self):
        icon_dir = os.path.join(get_base_dir(), "icons")
        if not os.path.exists(icon_dir): return
        self.raw_images = {}
        for root, dirs, files in os.walk(icon_dir):
            for filename in files:
                if filename.lower().endswith(".png"):
                    key = filename[:-4].lower()
                    try:
                        self.raw_images[key] = Image.open(os.path.join(root, filename)).convert("RGBA")
                    except Exception:
                        pass

    def get_icon_pil(self, token, scale_factor=1.0, is_pinned=False, override_suffix=None, is_macro=False):
        val = GLYPH_SUFFIXES.get(self.current_glyph.get(), ("",))
        real_theme_suffix = val[0].lower() if isinstance(val, tuple) else val.lower()
        
        if override_suffix is not None:
            style_suffix = override_suffix
        else:
            style_suffix = real_theme_suffix
            
        target_token = f"{token.lower()}{style_suffix}"
        
        if is_macro and style_suffix in ["_tk", "_t3"]:
            target_token += "_2"
            
        is_modern = self.modern_overlay_var.get() if is_pinned else False
        cache_key = (target_token, scale_factor, style_suffix, is_pinned, is_modern)
        
        if cache_key in self.icon_pil_cache:
            return self.icon_pil_cache[cache_key]
            
        base_img = self.raw_images.get(target_token)

        if not base_img and override_suffix is not None:
            if "_gamepad" in override_suffix and override_suffix != "_gamepad":
                base_img = self.raw_images.get(f"{token.lower()}_gamepad")
                
            if not base_img:
                style_suffix = real_theme_suffix
                target_token = f"{token.lower()}{style_suffix}"
                base_img = self.raw_images.get(target_token)
        
        if not base_img and target_token.endswith("_2"):
            base_img = self.raw_images.get(f"{token.lower()}{style_suffix}")
            
        if not base_img:
            base_img = self.raw_images.get(f"{token.lower()}_xb") if style_suffix == "_ps" else \
                       (self.raw_images.get(f"{token.lower()}_ps") if style_suffix == "_xb" else None)
        if not base_img:
            base_img = self.raw_images.get(token.lower())
                
        if base_img:
            target_size = int(self.base_icon_size * scale_factor)
            if target_size <= 0: target_size = 1
            resample_method = Image.Resampling.LANCZOS
            if is_pinned and not is_modern:
                resample_method = Image.Resampling.NEAREST
                
            resized = base_img.resize((target_size, target_size), resample_method)
            
            # --- FASTER ALPHA MASK RENDERING FOR UI OVERLAYS ---
            if is_pinned and not is_modern:
                hard_mask = resized.getchannel('A').point(lambda p: 255 if p > 127 else 0)
                resized.putalpha(255)
                clean_img = Image.new("RGBA", resized.size, (255, 0, 255, 255))
                clean_img.paste(resized, (0, 0), hard_mask)
                resized = clean_img
            # ---------------------------------------------------
            
            self.icon_pil_cache[cache_key] = resized
            return resized
            
        if token.lower().startswith("c_") or token.lower().startswith("h_"):
            fallback_pil = self.get_icon_pil(token.lower()[2:], scale_factor, is_pinned, override_suffix, is_macro)
            self.icon_pil_cache[cache_key] = fallback_pil
            return fallback_pil
            
        return None

    def get_icon(self, token, scale_factor=1.0, is_pinned=False, override_suffix=None, is_macro=False):
        if override_suffix is not None:
            style_suffix = override_suffix
        else:
            val = GLYPH_SUFFIXES.get(self.current_glyph.get(), ("",))
            style_suffix = val[0].lower() if isinstance(val, tuple) else val.lower()
            
        target_token = f"{token.lower()}{style_suffix}"
        
        if is_macro and style_suffix in ["_tk", "_t3"]:
            target_token += "_2"
            
        is_modern = self.modern_overlay_var.get() if is_pinned else False
        cache_key = (target_token, scale_factor, style_suffix, is_pinned, is_modern)
        
        if cache_key in self.icon_photo_cache:
            return self.icon_photo_cache[cache_key]
            
        pil_img = self.get_icon_pil(token, scale_factor, is_pinned, override_suffix, is_macro)
        if pil_img:
            photo = ImageTk.PhotoImage(pil_img)
            self.icon_photo_cache[cache_key] = photo
            return photo
            
        return None

    def register_standard_btn(self, btn):
        self.standard_btns.append(btn)

    def create_std_btn(self, parent, text, cmd, w_px=80, h_px=28):
        b = tk.Button(parent, text=text, command=cmd, image=self.dummy_pixel, compound="center", width=w_px, height=h_px)
        self.register_standard_btn((b, w_px, h_px, text))
        return b

    def apply_shortcut(self, code):
        if self.is_input_blocked(): return
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        ins_pos = c_idx if c_idx is not None else len(combo)
        
        inserts = []
        if code.lower() == "drc": inserts = ['mp', 'plus', 'mk']
        elif code.lower() == "qcf": inserts = ['down', 'downright', 'right']
        elif code.lower() == "qcb": inserts = ['down', 'downleft', 'left']
        elif code.lower() == "dp": inserts = ['right', 'down', 'downright']
        elif code.lower() == "rdp": inserts = ['left', 'down', 'downleft']
        elif code.lower() == "hcf": inserts = ['left', 'downleft', 'down', 'downright', 'right']
        elif code.lower() == "hcb": inserts = ['right', 'downright', 'down', 'downleft', 'left']
        
        if ins_pos > 0 and inserts:
            first = inserts[0]
            prev = combo[ins_pos - 1]
            if self.is_dir(first):
                if self.is_atk(prev):
                    combo.insert(ins_pos, 'goes_into')
                    ins_pos += 1
            elif self.is_atk(first):
                if self.is_dir(prev):
                    combo.insert(ins_pos, 'plus')
                    ins_pos += 1
                elif self.is_atk(prev):
                    combo.insert(ins_pos, 'goes_into')
                    ins_pos += 1

        for item in inserts:
            combo.insert(ins_pos, item)
            ins_pos += 1
            
        if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] = ins_pos
        self.refresh_displays(p, idx)
        self.scroll_to_cursor(p, idx)

    def apply_custom_shortcut(self, cmd_str):
        if self.is_input_blocked(): return
        if not cmd_str: return
        p = self.get_active_player()
        
        if hasattr(self, f"_tree_timer_{p}") and getattr(self, f"_tree_timer_{p}") is not None:
            self.after_cancel(getattr(self, f"_tree_timer_{p}"))
            setattr(self, f"_tree_timer_{p}", None)
            
        for part in cmd_str.replace('+', ' + ').replace('->', ' -> ').replace('>', ' > ').split():
            part = part.lower()
            if part == '+':
                self.handle_plus_logic()
            elif part in ['goes_into', '->', '>']:
                idx = self.data[p]["active_slot"].get()
                combo = self.data[p]["combos"][idx]
                c_idx = self.data[p]["cursors"][idx]
                ins_pos = c_idx if c_idx is not None else len(combo)
                if ins_pos > 0 and combo[ins_pos - 1] in ['goes_into', 'plus']:
                    combo[ins_pos - 1] = 'goes_into'
                else:
                    combo.insert(ins_pos, 'goes_into')
                    if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] += 1
            elif self.is_atk(part):
                self.add_attack(part)
            elif self.is_dir(part):
                self.add_direction(part)
                
        self.schedule_tree_refresh(p)

    def build_dynamic_macros(self):
        for btn in getattr(self, "dynamic_macro_btns", []):
            btn.destroy()
        self.dynamic_macro_btns = []
        
        self.palette_widgets = [pw for pw in self.palette_widgets if getattr(pw[0], "is_dynamic_macro", False) == False]
        
        glyph = self.current_glyph.get()
        val = GLYPH_SUFFIXES.get(glyph, ("",))
        if isinstance(val, str):
            val = (val,)
            
        if len(val) > 1:
            macros = val[1:] 
        else:
            macros = ("DRC, mp + mk",)
            
        for m in macros:
            parts = m.split(',', 1)
            name = parts[0].strip()
            cmd_str = parts[1].strip() if len(parts) > 1 else ""
            code = name.lower().replace(" ", "_")
            
            text_val = f"    {name}"
            btn = tk.Button(self.top_macro_container, command=lambda c=cmd_str: self.apply_custom_shortcut(c), font=("Arial", 8, "bold"))
            btn.is_dynamic_macro = True
            btn.pack(side="left", padx=2)
            
            tt_text = MACRO_TOOLTIPS.get(name.upper(), "Context sensitive. Will print entire input.")
            ToolTip(btn, tt_text)
            
            self.dynamic_macro_btns.append(btn)
            self.palette_widgets.append((btn, code, 0.5, text_val, 75, 28, True))

    def setup_glyph_menu(self):
        self.glyph_menu.delete(0, tk.END)
        for g in GLYPH_SUFFIXES.keys():
            if g not in self.custom_glyph_configs:
                self.glyph_menu.add_command(label=g, command=lambda sel=g: self.on_glyph_select(sel))
                
        if self.custom_glyph_configs:
            user_menu = tk.Menu(self.glyph_menu, tearoff=0)
            for g in self.custom_glyph_configs.keys():
                user_menu.add_command(label=g, command=lambda sel=g: self.on_glyph_select(sel))
            self.glyph_menu.add_cascade(label="User ➔", menu=user_menu)

    def setup_ui(self):
        self.columnconfigure(0, weight=1)
        self.columnconfigure(1, weight=3)
        self.rowconfigure(0, weight=1)
        
        self.left_panel = ttk.Frame(self, padding=5)
        self.left_panel.grid(row=0, column=0, sticky="nsew", padx=(10, 5), pady=10)
        
        toolbar = ttk.Frame(self.left_panel)
        toolbar.pack(fill="x", pady=2)
        ttk.Label(toolbar, text="PALETTE", font=("Arial", 11, "bold")).pack(side="left")
        
        theme_f = ttk.Frame(toolbar)
        theme_f.pack(side="right")
        
        self.theme_mb = ttk.Menubutton(theme_f, text=self.current_theme.get())
        self.theme_mb.config(width=15)
        self.theme_mb.pack(side="left")
        self.theme_menu = tk.Menu(self.theme_mb, tearoff=0)
        self.theme_mb.configure(menu=self.theme_menu)
        self.theme_menu.configure(postcommand=lambda m=self.theme_menu, p=self.themes_dir: self.populate_themes_menu(m, p))
        
        theme_btn = self.create_std_btn(theme_f, "⚙", lambda: ThemeBuilderWindow(self), w_px=32, h_px=28)
        theme_btn.pack(side="left", padx=(2,0))
        ToolTip(theme_btn, "Opens the UI theme editor.")
        
        glyph_f = ttk.Frame(toolbar)
        glyph_f.pack(side="right", padx=5)
        
        self.glyph_mb = ttk.Menubutton(glyph_f, text=self.current_glyph.get())
        self.glyph_mb.config(width=15)
        self.glyph_mb.pack(side="left")
        self.glyph_menu = tk.Menu(self.glyph_mb, tearoff=0)
        self.glyph_mb.configure(menu=self.glyph_menu)
        self.setup_glyph_menu()
        
        glyph_btn = self.create_std_btn(glyph_f, "🛠", lambda: GlyphBuilderWindow(self), w_px=32, h_px=28)
        glyph_btn.pack(side="left", padx=(2,0))
        ToolTip(glyph_btn, "Open Custom Glyph Builder.")

        btn_frame = ttk.LabelFrame(self.left_panel, text=" Attacks & Chains ", padding=2)
        btn_frame.pack(fill="x", pady=2)
        
        btn_frame.columnconfigure(0, weight=1)
        btn_frame.columnconfigure(6, weight=1)
        
        attack_keys = ['LP', 'MP', 'HP', 'Any_P', 'plus', 'LK', 'MK', 'HK', 'Any_K', 'newline']
        
        for i, key in enumerate(attack_keys):
            fallback_text = TEXT_MAP.get(key.lower(), key)
            is_special = key.lower() in ['plus', 'newline']
            
            if is_special:
                cmd = self.handle_plus_logic if key.lower() == 'plus' else lambda k=key: self._inject_tokens([k.lower()])
                btn = tk.Button(btn_frame, command=cmd)
            else:
                btn = tk.Button(btn_frame)
                
                def on_press(event, k=key.lower()):
                    event.widget._press_time = time.perf_counter()
                
                def on_release(event, k=key.lower()):
                    if hasattr(event.widget, '_press_time') and event.widget._press_time is not None:
                        duration = time.perf_counter() - event.widget._press_time
                        event.widget._press_time = None
                        x, y = event.x, event.y
                        if 0 <= x <= event.widget.winfo_width() and 0 <= y <= event.widget.winfo_height():
                            if duration >= 0.75:
                                self._inject_tokens([f"h_{k}"])
                            else:
                                self._inject_tokens([k])

                btn.bind("<ButtonPress-1>", on_press)
                btn.bind("<ButtonRelease-1>", on_release)
            
            ToolTip(btn, "Click to add to selected combo. Certain game settings can hold to change output.")
            btn.is_dynamic_macro = False
            self.palette_widgets.append((btn, key.lower(), 0.75, fallback_text, 40, 35, False))   
            btn.grid(row=i//5, column=(i%5)+1, padx=2, pady=2)

        dir_frame = ttk.LabelFrame(self.left_panel, text=" Directions ", padding=2)
        dir_frame.pack(fill="x", pady=2)
        
        dir_frame.columnconfigure(0, weight=1)
        dir_frame.columnconfigure(8, weight=1)
        
        dir_layout = [
            ('upleft', 0, 1), ('Up', 0, 2), ('upright', 0, 3),
            ('left',  1, 1), (None, 1, 2), ('right',  1, 3),
            ('downleft', 2, 1), ('down', 2, 2), ('downright', 2, 3)
        ]
        
        for key, r, c in dir_layout:
            if key:
                fallback_text = TEXT_MAP.get(key.lower(), key)
                btn = tk.Button(dir_frame)
                
                def on_press(event, k=key.lower()):
                    event.widget._press_time = time.perf_counter()
                
                def on_release(event, k=key.lower()):
                    if hasattr(event.widget, '_press_time') and event.widget._press_time is not None:
                        duration = time.perf_counter() - event.widget._press_time
                        event.widget._press_time = None
                        x, y = event.x, event.y
                        if 0 <= x <= event.widget.winfo_width() and 0 <= y <= event.widget.winfo_height():
                            if duration >= 0.75:
                                self._inject_tokens([f"c_{k}"])
                            else:
                                self._inject_tokens([k])

                btn.bind("<ButtonPress-1>", on_press)
                btn.bind("<ButtonRelease-1>", on_release)
                
                ToolTip(btn, "Click to add to selected combo. Hold for charge input.")
                btn.is_dynamic_macro = False
                self.palette_widgets.append((btn, key.lower(), 0.75, fallback_text, 35, 35, False))     
                btn.grid(row=r, column=c, padx=2, pady=2)

        motion_layout = [
            ('qcb', 0, 5, 1), ('qcf', 0, 6, 1),
            ('hcb', 1, 5, 1), ('hcf', 1, 6, 1), ('360', 1, 7, 1),
            ('rdp', 2, 5, 1), ('dp', 2, 6, 1)
        ]
        
        for key, r, c, span in motion_layout:
            cmd = lambda k=key: self._inject_tokens([k.lower()]) 
            fallback_text = TEXT_MAP.get(key, key.upper())
            
            btn = tk.Button(dir_frame, command=cmd)
            ToolTip(btn, "Click to add to selected combo. Will print the selected icon instead of entire motion input.")
            btn.is_dynamic_macro = False
            self.palette_widgets.append((btn, key.lower(), 0.75, fallback_text, 35, 35, False)) 
            px = (12, 2) if c == 5 else 2
            btn.grid(row=r, column=c, columnspan=span, padx=px, pady=2)

        self.macro_frame = ttk.LabelFrame(self.left_panel, text=" Macro Shortcuts ", padding=2)
        self.macro_frame.pack(fill="x", pady=2)
        
        self.top_macro_container = tk.Frame(self.macro_frame)
        self.top_macro_container.pack(side="top", pady=2, anchor="center")
        
        self.bottom_macro_container = tk.Frame(self.macro_frame)
        self.bottom_macro_container.pack(side="top", pady=2, anchor="center")
        
        self.build_dynamic_macros()
        
        macros_bottom = [
            ("QCB", "qcb", 0, 0), ("QCF", "qcf", 0, 1),
            ("HCB", "hcb", 1, 0), ("HCF", "hcf", 1, 1),
            ("RDP", "rdp", 2, 0), ("FDP", "dp", 2, 1)
        ]
        for name, code, r, c in macros_bottom:
            text_val = f"    {name}" 
            btn = tk.Button(self.bottom_macro_container, command=lambda code_key=code: self.apply_shortcut(code_key), font=("Arial", 8, "bold"))
            ToolTip(btn, MACRO_TOOLTIPS.get(name, "Context sensitive. Will print entire input."))
            btn.is_dynamic_macro = False
            self.palette_widgets.append((btn, code.lower(), 0.5, text_val, 75, 28, True))
            btn.grid(row=r, column=c, padx=2, pady=2)

        util_frame = ttk.LabelFrame(self.left_panel, text=" Combo Controls ", padding=5)
        util_frame.pack(fill="x", pady=(2, 5)) 
        
        btn_clr_slot = self.create_std_btn(util_frame, "CLEAR CURRENT SLOT", self.clear_active_slot, w_px=220, h_px=28)
        btn_clr_slot.pack(side="top", pady=2)
        ToolTip(btn_clr_slot, "Clears the name and combo from the current slot.")
        
        btn_clr_all = self.create_std_btn(util_frame, "CLEAR ALL", self.clear_all, w_px=220, h_px=28)
        btn_clr_all.pack(side="top", pady=2)
        ToolTip(btn_clr_all, "clears every slot. Warning - irreversible!")

        right_panel = ttk.LabelFrame(self, text=" COMBO MANAGER ", padding=10)
        right_panel.grid(row=0, column=1, sticky="nsew", padx=(5, 10), pady=10)
        
        global_toolbar = ttk.Frame(right_panel)
        global_toolbar.pack(fill="x", pady=(0, 5))
        
        ttk.Label(global_toolbar, text="Gamepad:", font=("Arial", 9, "bold")).pack(side="left")
        
        self.gamepad_mb = ttk.Menubutton(global_toolbar, text=self.active_gamepad_val.get(), textvariable=self.active_gamepad_val)
        self.gamepad_mb.config(width=26)
        self.gamepad_mb.pack(side="left", padx=(2, 10))
        ToolTip(self.gamepad_mb, "Use your gamepad to input a combo into the currently selected field.")
        self.gamepad_menu = tk.Menu(self.gamepad_mb, tearoff=0)
        self.gamepad_mb.configure(menu=self.gamepad_menu)
        
        cb_pin_bg = ttk.Checkbutton(global_toolbar, text="Pin Background", variable=self.modern_overlay_var, command=self.on_overlay_toggle)
        cb_pin_bg.pack(side="left", padx=5)
        ToolTip(cb_pin_bg, "Swaps between fully transparent mode and backdrop mode.")
        
        ttk.Label(global_toolbar, text="Alpha %:", font=("Arial", 9)).pack(side="left", padx=(10, 2))
        alpha_entry = ttk.Entry(global_toolbar, textvariable=self.pin_alpha_var, width=4)
        alpha_entry.pack(side="left")
        ToolTip(alpha_entry, "Controls how transparent the entire pinned combo is (When pin background is ticked)")
        alpha_entry.bind("<Return>", lambda e: self.on_overlay_toggle())
        
        cmd_mb = ttk.Menubutton(global_toolbar, text="Command Lists")
        cmd_mb.pack(side="right", padx=2)
        ToolTip(cmd_mb, "Preset command lists and system mechanics for multiple games.")
        cmd_menu = tk.Menu(cmd_mb, tearoff=0)
        cmd_menu.configure(postcommand=lambda m=cmd_menu, p=self.cmd_lists_dir: self.populate_presets_menu(m, p))
        cmd_mb.configure(menu=cmd_menu)
        
        combo_mb = ttk.Menubutton(global_toolbar, text="Combos")
        combo_mb.pack(side="right", padx=2)
        ToolTip(combo_mb, "Preset combos for multiple games. You can add combos here by saving them in Presets>Combos.")
        combo_menu = tk.Menu(combo_mb, tearoff=0)
        combo_menu.configure(postcommand=lambda m=combo_menu, p=self.combos_dir: self.populate_presets_menu(m, p))
        combo_mb.configure(menu=combo_menu)
        
        self.notebook = ttk.Notebook(right_panel)
        self.notebook.pack(fill="both", expand=True)
        
        self.viewer_mb = ttk.Menubutton(self.notebook, text="Input Viewer ⚙")
        self.viewer_mb.place(relx=0.0, rely=0.0, anchor="nw", x=132, y=0)
        ToolTip(self.viewer_mb, "Settings for the live input viewer.")
        
        # The contents of this menu are entirely generated by populate_layouts_menus
        self.viewer_menu = tk.Menu(self.viewer_mb, tearoff=0)
        self.viewer_mb.configure(menu=self.viewer_menu)
        
        for p in ["P1", "P2"]:
            self.build_player_tab(p)

    def _on_root_configure(self, event):
        if event.widget == self:
            if hasattr(self, '_resize_timer') and self._resize_timer:
                self.after_cancel(self._resize_timer)
            self._resize_timer = self.after(100, self._apply_dynamic_gradients)

    def _apply_dynamic_gradients(self):
        theme = self.active_theme_data
        colors = theme.get("bg_grad")
        current_fg = theme.get("font", "#FFFFFF")
        
        if theme.get("grad_main_bg", False) and colors:
            w, h = self.winfo_width(), self.winfo_height()
            if w > 1 and h > 1:
                last_w = getattr(self.bg_canvas, "_last_w", 0)
                last_h = getattr(self.bg_canvas, "_last_h", 0)
                if abs(w - last_w) > 5 or abs(h - last_h) > 5:
                    self.bg_canvas._last_w = w
                    self.bg_canvas._last_h = h
                    pil_img = self.get_gradient_pil(w, h, colors)
                    self.bg_photo = ImageTk.PhotoImage(pil_img)
                    self.bg_canvas.create_image(0, 0, image=self.bg_photo, anchor="nw")
        else:
            self.bg_canvas.delete("all")
            self.bg_canvas.configure(bg=theme.get("bg", "#0F0F0F"))

        if theme.get("grad_standard_btns", False) and colors:
            hl_colors = self.lighten_colors(colors, 40) if theme.get("grad_highlight") else None
            for b_tuple in self.standard_btns:
                b = b_tuple[0]
                if not b.winfo_exists(): continue
                w, h = b_tuple[1], b_tuple[2]
                if w > 1 and h > 1:
                    last_w = getattr(b, "_last_grad_w", 0)
                    last_h = getattr(b, "_last_grad_h", 0)
                    if abs(w - last_w) > 2 or abs(h - last_h) > 2:
                        b._last_grad_w = w
                        b._last_grad_h = h
                        img = self.get_gradient_pil(w, h, colors)
                        photo = ImageTk.PhotoImage(img)
                        hl_photo = None
                        if hl_colors:
                            hl_photo = ImageTk.PhotoImage(self.get_gradient_pil(w, h, hl_colors))
                        self._keep_alive_images[b] = (photo, hl_photo)
                        b.configure(image=photo, compound="center", bd=0, highlightthickness=0, padx=0, pady=0, fg=current_fg, activeforeground=current_fg)
        else:
            for b_tuple in self.standard_btns:
                b = b_tuple[0]
                if not b.winfo_exists(): continue
                self._keep_alive_images[b] = (None, None)
                b._last_grad_w = 0 
                b._last_grad_h = 0
                b.configure(image="", bd=1, bg=theme.get("btn_bg", "#1E1F20"), fg=current_fg, padx=1, pady=1)

    def load_theme(self, filepath, apply=True):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            self.active_theme_data = self.compile_theme_data(data)
            name = os.path.splitext(os.path.basename(filepath))[0]
            self.current_theme.set(name)
            
            if hasattr(self, 'theme_mb'):
                self.theme_mb.config(text=name)
                
            self.active_theme_file = filepath
            if apply:
                self._process_theme_change()
        except Exception:
            pass

    def _process_theme_change(self):
        self._is_loading = True
        self.apply_theme()
        if getattr(self, 'gamepad_viewer', None) and self.gamepad_viewer.winfo_exists():
            self.gamepad_viewer.apply_transparency()
            self.gamepad_viewer.build_layout()
        self._is_loading = False

    def on_glyph_select(self, selection):
        self.current_glyph.set(selection)
        self.glyph_mb.config(text=selection)
        self.update_idletasks()
        self.after(10, self._process_glyph_change)
        
    def _process_glyph_change(self):
        self._is_loading = True
        self.build_dynamic_macros()
        self.update_palette_images()
        self.refresh_all_displays()
        if getattr(self, 'gamepad_viewer', None) and self.gamepad_viewer.winfo_exists():
            self.gamepad_viewer.build_layout()
        self._is_loading = False

    def populate_themes_menu(self, parent_menu, current_path):
        parent_menu.delete(0, tk.END)
        if not current_path or not os.path.exists(current_path): return
        try: items = os.listdir(current_path)
        except OSError: return
            
        dirs = [d for d in items if os.path.isdir(os.path.join(current_path, d))]
        files = [f for f in items if os.path.isfile(os.path.join(current_path, f)) and f.endswith('.json')]
        
        if not dirs and not files:
            parent_menu.add_command(label="(Empty)", state="disabled")
            return
            
        for d in sorted(dirs):
            sub_menu = tk.Menu(parent_menu, tearoff=0)
            self._build_theme_sub_menu(sub_menu, os.path.join(current_path, d))
            parent_menu.add_cascade(label=d, menu=sub_menu)
            
        if dirs and files: parent_menu.add_separator()
            
        for f in sorted(files):
            full_path = os.path.join(current_path, f)
            parent_menu.add_command(label=f[:-5], command=lambda path=full_path: self.load_theme(path))

    def _build_theme_sub_menu(self, parent_menu, current_path):
        try: items = os.listdir(current_path)
        except OSError: return
            
        dirs = [d for d in items if os.path.isdir(os.path.join(current_path, d))]
        files = [f for f in items if os.path.isfile(os.path.join(current_path, f)) and f.endswith('.json')]
        
        if not dirs and not files:
            parent_menu.add_command(label="(Empty)", state="disabled")
            return
            
        for d in sorted(dirs):
            sub_menu = tk.Menu(parent_menu, tearoff=0)
            self._build_theme_sub_menu(sub_menu, os.path.join(current_path, d))
            parent_menu.add_cascade(label=d, menu=sub_menu)
            
        if dirs and files: parent_menu.add_separator()
            
        for f in sorted(files):
            full_path = os.path.join(current_path, f)
            parent_menu.add_command(label=f[:-5], command=lambda path=full_path: self.load_theme(path))

    def populate_presets_menu(self, parent_menu, current_path):
        parent_menu.delete(0, tk.END)
        if not current_path or not os.path.exists(current_path): return
        try: items = os.listdir(current_path)
        except OSError: return
            
        dirs = [d for d in items if os.path.isdir(os.path.join(current_path, d))]
        files = [f for f in items if os.path.isfile(os.path.join(current_path, f)) and f.endswith('.json')]
        
        if not dirs and not files:
            parent_menu.add_command(label="(Empty)", state="disabled")
            return
            
        for d in sorted(dirs):
            sub_menu = tk.Menu(parent_menu, tearoff=0)
            self._build_sub_menu(sub_menu, os.path.join(current_path, d))
            parent_menu.add_cascade(label=d, menu=sub_menu)
            
        if dirs and files: parent_menu.add_separator()
            
        for f in sorted(files):
            full_path = os.path.join(current_path, f)
            parent_menu.add_command(label=f[:-5], command=lambda path=full_path: self.load_all_from_path(self.get_active_player(), path))

    def _build_sub_menu(self, parent_menu, current_path):
        try: items = os.listdir(current_path)
        except OSError: return
            
        dirs = [d for d in items if os.path.isdir(os.path.join(current_path, d))]
        files = [f for f in items if os.path.isfile(os.path.join(current_path, f)) and f.endswith('.json')]
        
        if not dirs and not files:
            parent_menu.add_command(label="(Empty)", state="disabled")
            return
            
        for d in sorted(dirs):
            sub_menu = tk.Menu(parent_menu, tearoff=0)
            self._build_sub_menu(sub_menu, os.path.join(current_path, d))
            parent_menu.add_cascade(label=d, menu=sub_menu)
            
        if dirs and files: parent_menu.add_separator()
            
        for f in sorted(files):
            full_path = os.path.join(current_path, f)
            parent_menu.add_command(label=f[:-5], command=lambda path=full_path: self.load_all_from_path(self.get_active_player(), path))

    def build_player_tab(self, p):
        tab_frame = ttk.Frame(self.notebook)
        self.notebook.add(tab_frame, text=f" Player {p[-1]} ")
        
        tab_toolbar = ttk.Frame(tab_frame)
        tab_toolbar.pack(fill="x", pady=5)
        
        row1 = ttk.Frame(tab_toolbar)
        row1.pack(fill="x", pady=2)
        ttk.Label(row1, text="Combos:", font=("Arial", 9, "bold")).pack(side="left")
        cnt_entry = ttk.Entry(row1, textvariable=self.data[p]["slot_count_var"], width=4)
        cnt_entry.pack(side="left", padx=2)
        cnt_entry.bind("<Return>", lambda e, pl=p: self.apply_slot_count(pl))
        
        btn_update = self.create_std_btn(row1, "Update", lambda pl=p: self.apply_slot_count(pl), w_px=55, h_px=24)
        btn_update.pack(side="left", padx=(0, 10))
        ToolTip(btn_update, "Instantly update the list of combos to the specified number.")
        ToolTip(cnt_entry, "Instantly update the list of combos to the specified number.")
        
        ttk.Label(row1, text="Pin Size:", font=("Arial", 9, "bold")).pack(side="left")
        scale_entry = ttk.Entry(row1, textvariable=self.data[p]["current_scale"], width=4)
        scale_entry.pack(side="left", padx=2)
        ToolTip(scale_entry, "change the size of a pinned combo on the screen.")
        scale_entry.bind("<Return>", lambda e, pl=p: self.on_scale_change(pl))

        ttk.Label(row1, text="Controller Size:", font=("Arial", 9, "bold")).pack(side="left", padx=(10, 2))
        ctrl_scale_entry = ttk.Entry(row1, textvariable=self.controller_scale_var, width=4)
        ctrl_scale_entry.pack(side="left", padx=2)
        ToolTip(ctrl_scale_entry, "Change the size of the Input Viewer Gamepad.")
        ctrl_scale_entry.bind("<Return>", lambda e: self.on_viewer_layout_change())

        ttk.Label(row1, text="Outline:", font=("Arial", 9, "bold")).pack(side="left", padx=(10, 2))
        outline_entry = ttk.Entry(row1, textvariable=self.viewer_outline_width_var, width=3)
        outline_entry.pack(side="left", padx=2)
        ToolTip(outline_entry, "Change the thickness of the inactive button outline.")
        outline_entry.bind("<Return>", lambda e: self.on_viewer_layout_change())

        ttk.Label(row1, text="Highlight:", font=("Arial", 9, "bold")).pack(side="left", padx=(10, 2))
        hl_entry = ttk.Entry(row1, textvariable=self.viewer_highlight_width_var, width=3)
        hl_entry.pack(side="left", padx=2)
        ToolTip(hl_entry, "Change the thickness of the active/pressed button outline.")
        hl_entry.bind("<Return>", lambda e: self.on_viewer_layout_change())
        
        cb_justify = ttk.Checkbutton(row1, text="Justify Pins", variable=self.data[p]["justify_pins"], command=lambda pl=p: self.on_justify_toggle(pl))
        cb_justify.pack(side="left", padx=10)
        ToolTip(cb_justify, "Arrange pins from top to down in a row.")
        
        row2 = ttk.Frame(tab_toolbar)
        row2.pack(fill="x", pady=2)
        
        btn_pin_all = self.create_std_btn(row2, "Pin All", lambda pl=p: self.pin_all(pl), w_px=75, h_px=24)
        btn_pin_all.pack(side="left", padx=2)
        ToolTip(btn_pin_all, "Pin every combo to the screen.")
        
        btn_unpin_all = self.create_std_btn(row2, "Unpin All", lambda pl=p: self.unpin_all(pl), w_px=75, h_px=24)
        btn_unpin_all.pack(side="left", padx=2)
        ToolTip(btn_unpin_all, "Unpins all combos from the screen.")
        
        btn_save_all = self.create_std_btn(row2, "Save All", lambda pl=p: self.save_all_combos(pl), w_px=75, h_px=24)
        btn_save_all.pack(side="right", padx=2)
        ToolTip(btn_save_all, "Saves every combo to a file to be loaded later.")
        
        btn_load_all = self.create_std_btn(row2, "Load All", lambda pl=p: self.load_all_combos(pl), w_px=75, h_px=24)
        btn_load_all.pack(side="right", padx=2)
        ToolTip(btn_load_all, "Loads a previously saved combo.")
        
        rp_canvas = tk.Canvas(tab_frame, highlightthickness=0)
        rp_vsb = ttk.Scrollbar(tab_frame, orient="vertical", command=rp_canvas.yview)
        rp_canvas.configure(yscrollcommand=rp_vsb.set)
        setattr(self, f"vsb_{p}", rp_vsb)
        
        rp_vsb.pack(side="right", fill="y")
        rp_canvas.pack(side="left", fill="both", expand=True)
        
        right_inner = tk.Frame(rp_canvas)
        
        self.data[p]["tree_canvas"] = tk.Canvas(right_inner, width=20, highlightthickness=0)
        self.data[p]["tree_canvas"].pack(side="left", fill="y", pady=2)
        
        self.data[p]["rows_container"] = tk.Frame(right_inner)
        self.data[p]["rows_container"].pack(side="left", fill="both", expand=True)
        
        right_inner_window = rp_canvas.create_window((0, 0), window=right_inner, anchor="nw")
        
        right_inner.bind("<Configure>", lambda e: rp_canvas.configure(scrollregion=rp_canvas.bbox("all")))
        rp_canvas.bind("<Configure>", lambda e: rp_canvas.itemconfig(right_inner_window, width=e.width))
        
        self.data[p]["main_canvas"] = rp_canvas
        self.data[p]["main_inner"] = self.data[p]["rows_container"]
        
        self.apply_slot_count(p)

    def schedule_tree_refresh(self, p):
        if hasattr(self, f"_tree_timer_{p}") and getattr(self, f"_tree_timer_{p}") is not None:
            self.after_cancel(getattr(self, f"_tree_timer_{p}"))
        setattr(self, f"_tree_timer_{p}", self.after(100, lambda: self.refresh_tree_lines(p)))

    def refresh_tree_lines(self, p):
        if getattr(self, '_is_loading', False): return
        
        canvas = self.data[p]["tree_canvas"]
        canvas.delete("all")
        theme_color = self.active_theme_data.get("highlight", "#505050")
        
        self.data[p]["rows_container"].update_idletasks() 
        
        parent_idx = -1
        children = []
        
        for i in range(len(self.data[p]["row_frames"])):
            text = self.data[p]["combo_texts"][i].get("1.0", "end-1c").strip()
            is_child = text.startswith("[>]")
            
            row = self.data[p]["row_frames"][i]
            if is_child:
                row.pack_configure(padx=(15, 0))
                if parent_idx != -1:
                    children.append(i)
            else:
                row.pack_configure(padx=(0, 0))
                self._draw_tree_group(p, canvas, parent_idx, children, theme_color)
                parent_idx = i
                children = []
                
        self._draw_tree_group(p, canvas, parent_idx, children, theme_color)

    def _draw_tree_group(self, p, canvas, parent_idx, children, line_color):
        if parent_idx == -1 or not children: return
        
        parent_row = self.data[p]["row_frames"][parent_idx]
        p_y = parent_row.winfo_y() + parent_row.winfo_height() - 8
        
        last_child_row = self.data[p]["row_frames"][children[-1]]
        last_c_y = last_child_row.winfo_y() + 20 
        
        x_line = 10 
        canvas.create_line(x_line, p_y, x_line, last_c_y, fill=line_color, width=2)
        
        for c_idx in children:
            c_row = self.data[p]["row_frames"][c_idx]
            c_y = c_row.winfo_y() + 20
            canvas.create_line(x_line, c_y, 20, c_y, fill=line_color, width=2)

    def apply_slot_count(self, p=None):
        if p is None: p = self.get_active_player()
        try: target = int(self.data[p]["slot_count_var"].get())
        except ValueError: return
        
        if target < 1: target = 1
        
        if target > 250:
            target = 250
            self.data[p]["slot_count_var"].set("250")
            messagebox.showinfo("Limit Reached", "To ensure smooth performance and prevent OS instability, the maximum number of combo slots is limited to 250.")
        
        current = len(self.data[p]["row_frames"])
        if target > current:
            for i in range(current, target):
                self.data[p]["combos"].append([])
                self.data[p]["pinned_vars"].append(tk.BooleanVar(value=False))
                self.data[p]["pinned_windows"].append(None)
                self.data[p]["cursors"].append(None)
                self.data[p]["cursor_widgets"].append(None)
                self.build_combo_row(p, i)
        elif target < current:
            for i in range(current - 1, target - 1, -1):
                self.remove_combo_row(p)
                
        self.schedule_tree_refresh(p)
        self.update_palette_images()

    def move_combo_row(self, p, start_i, target_i):
        combo = self.data[p]["combos"].pop(start_i)
        cursor = self.data[p]["cursors"].pop(start_i)
        self.data[p]["combos"].insert(target_i, combo)
        self.data[p]["cursors"].insert(target_i, cursor)
        
        texts = [t.get("1.0", "end-1c") for t in self.data[p]["combo_texts"]]
        pins = [v.get() for v in self.data[p]["pinned_vars"]]
        
        t = texts.pop(start_i)
        texts.insert(target_i, t)
        pin = pins.pop(start_i)
        pins.insert(target_i, pin)
        
        for i in range(len(self.data[p]["combos"])):
            self.data[p]["combo_texts"][i].delete("1.0", tk.END)
            self.data[p]["combo_texts"][i].insert("1.0", texts[i])
            self.data[p]["pinned_vars"][i].set(pins[i])
            
        active = self.data[p]["active_slot"].get()
        if active == start_i: self.data[p]["active_slot"].set(target_i)
        elif start_i < active <= target_i: self.data[p]["active_slot"].set(active - 1)
        elif target_i <= active < start_i: self.data[p]["active_slot"].set(active + 1)
            
        self.on_overlay_toggle() 
        self.refresh_all_displays()
        self.schedule_tree_refresh(p)

    def build_combo_row(self, p, idx):
        parent = self.data[p]["main_inner"]
        row_frame = ttk.Frame(parent)
        row_frame.pack(fill="x", pady=2)
        self.data[p]["row_frames"].append(row_frame)
        
        theme = self.active_theme_data
        drag_handle = tk.Label(row_frame, text="↕", font=("Arial", 14), cursor="sb_v_double_arrow", bg=theme["bg"], fg=theme["font"])
        drag_handle.pack(side="left", padx=(2, 2))
        
        def start_drag(e, pl=p):
            row_f = e.widget.master
            try:
                start_i = self.data[pl]["row_frames"].index(row_f)
                self.drag_data = {"player": pl, "start_index": start_i}
            except ValueError: pass
                
        def end_drag(e, pl=p):
            if not hasattr(self, "drag_data") or self.drag_data.get("player") != pl: return
            start_i = self.drag_data["start_index"]
            target_i = start_i
            min_dist = float('inf')
            for i, frame in enumerate(self.data[pl]["row_frames"]):
                fy = frame.winfo_rooty()
                fh = frame.winfo_height()
                dist = abs(e.y_root - (fy + fh/2))
                if dist < min_dist:
                    min_dist = dist
                    target_i = i
            if start_i != target_i:
                self.move_combo_row(pl, start_i, target_i)
                
        drag_handle.bind("<ButtonPress-1>", start_drag)
        drag_handle.bind("<ButtonRelease-1>", end_drag)
        
        ttk.Radiobutton(row_frame, text=f"{idx+1}", variable=self.data[p]["active_slot"], value=idx, width=3).pack(side="left")
        
        name_text = tk.Text(row_frame, width=14, height=2, font=("Arial", 9), wrap="word")
        name_text.pack(side="left", padx=(0, 5))
        name_text.insert("1.0", f"Combo {idx+1}")
        name_text.bind("<KeyRelease>", lambda e, pl=p: self.schedule_tree_refresh(pl))
        self.data[p]["combo_texts"].append(name_text)
        
        self.create_std_btn(row_frame, "S", lambda pl=p, i=idx: self.save_single_combo(pl, i), w_px=22, h_px=24).pack(side="left", padx=1)
        self.create_std_btn(row_frame, "L", lambda pl=p, i=idx: self.load_single_combo(pl, i), w_px=22, h_px=24).pack(side="left", padx=1)
        cb_pin = ttk.Checkbutton(row_frame, text="Pin", variable=self.data[p]["pinned_vars"][idx], 
                        command=lambda pl=p, i=idx: self.toggle_pin(pl, i))
        cb_pin.pack(side="left", padx=5)
        ToolTip(cb_pin, "This specific combo to the screen.")
        
        scroll_wrapper = tk.Frame(row_frame, relief="sunken", borderwidth=1)
        scroll_wrapper.pack(side="left", fill="x", expand=True, padx=5)
        
        canvas = tk.Canvas(scroll_wrapper, height=28, highlightthickness=0, bg=theme["bg"], cursor="hand2")
        scrollbar = ttk.Scrollbar(scroll_wrapper, orient="horizontal", command=canvas.xview)
        canvas.configure(xscrollcommand=scrollbar.set)
        
        canvas.grid(row=0, column=0, sticky="nsew")
        scroll_wrapper.rowconfigure(0, weight=1)
        scroll_wrapper.columnconfigure(0, weight=1)
        
        def focus_and_click(event, pl=p, i=idx):
            self.clear_all_cursors()
            self.data[pl]["active_slot"].set(i)
            self.data[pl]["canvases"][i].focus_set()
            
            cx = self.data[pl]["canvases"][i].canvasx(event.x)
            cy = self.data[pl]["canvases"][i].canvasy(event.y)
            
            clicked_pos = len(self.data[pl]["combos"][i])
            if "token_bboxes" in self.data[pl] and i in self.data[pl]["token_bboxes"]:
                for pos, (x1, x2, y1, y2) in enumerate(self.data[pl]["token_bboxes"][i]):
                    if x1 <= cx <= x2 and y1 <= cy <= y2:
                        if cx < (x1 + x2) / 2:
                            clicked_pos = pos
                        else:
                            clicked_pos = pos + 1
                        break
            
            self.data[pl]["cursors"][i] = clicked_pos
            self.refresh_displays(pl, i, update_pins=False)
            
        canvas.bind("<Button-1>", focus_and_click)
        canvas.bind("<BackSpace>", lambda e: self.backspace())
        canvas.bind("<Return>", lambda e: self.add_attack('newline'))
        
        self.data[p]["canvases"].append(canvas)
        self.data[p]["scrollbars"].append(scrollbar)
        
        self.refresh_displays(p, idx)
        self.apply_theme_to_child(row_frame)

    def remove_combo_row(self, p):
        idx = len(self.data[p]["row_frames"]) - 1
        if idx < 0: return
        
        if self.data[p]["pinned_windows"][idx]:
            self.data[p]["pinned_windows"][idx].destroy()
            
        self.data[p]["row_frames"][idx].destroy()
        
        self.data[p]["row_frames"].pop()
        self.data[p]["combo_texts"].pop()
        self.data[p]["combos"].pop()
        self.data[p]["pinned_vars"].pop()
        self.data[p]["pinned_windows"].pop()
        self.data[p]["cursors"].pop()
        self.data[p]["cursor_widgets"].pop()
        self.data[p]["canvases"].pop()
        self.data[p]["scrollbars"].pop()
        
        if self.data[p]["active_slot"].get() > idx - 1:
            self.data[p]["active_slot"].set(max(0, idx - 1))
            
        if self.data[p]["justify_pins"].get():
            self.refresh_master_pin(p)

    def apply_theme_to_child(self, parent):
        theme = self.active_theme_data
        bg, fg, ent = theme["bg"], theme["font"], theme["entry_bg"]
        hl = theme.get("highlight", "#505050")
        is_modern = theme.get("palette_style", "Classic") == "Modern"
        
        def update_tk_widgets(parent_node):
            if isinstance(parent_node, tk.Toplevel) and parent_node.title() == "Select Color":
                return
                
            for child in parent_node.winfo_children():
                if isinstance(child, tk.Toplevel) and child.title() == "Select Color":
                    continue 
                
                try:
                    if isinstance(child, ttk.Widget):
                        pass # Safety shield: Don't inject tk styling into ttk widgets
                    elif isinstance(child, tk.Button) and not child.cget('image'):
                        if not getattr(child, "is_color_preview", False):
                            child.configure(bg=ent, fg=fg, activebackground=hl, activeforeground=fg)
                    elif isinstance(child, (tk.Text, tk.Entry)):
                        child.configure(bg=ent, fg=fg, insertbackground=fg)
                    elif isinstance(child, tk.LabelFrame):
                        child.configure(bg=bg, fg=fg)
                    elif isinstance(child, tk.Label) and child.cget("text") == "↕":
                        child.configure(bg=bg, fg=fg)
                    elif isinstance(child, tk.Frame):
                        if child.winfo_parent() != str(self): child.configure(bg=bg)
                    elif isinstance(child, tk.Canvas): 
                        top = child.winfo_toplevel()
                        if isinstance(top, (PinnedComboWindow, MasterPinnedWindow, GamepadViewerWindow)):
                            pass # Protect overlay canvases from losing their transparency colorkey
                        elif "preview" not in str(child).lower() and "tree_canvas" not in str(child).lower() and child not in sum([d["canvases"] for d in getattr(self, 'data', {}).values()], []):
                            child.configure(bg=bg)
                except tk.TclError:
                    pass
                        
                update_tk_widgets(child)
                
        update_tk_widgets(parent)

    def apply_theme(self):
        theme = self.active_theme_data
        bg, fg, hl, ent = theme["bg"], theme["font"], theme["highlight"], theme["entry_bg"]
        is_modern = theme.get("palette_style", "Classic") == "Modern"
        
        self.configure(bg=bg)
        
        style = ttk.Style(self)
        
        if is_modern:
            if 'clam' in style.theme_names():
                style.theme_use('clam')
                
            style.configure('.', background=bg, foreground=fg)
            style.configure('TFrame', background=bg)
            style.configure('TLabel', background=bg, foreground=fg)
            
            style.configure('TEntry', fieldbackground=ent, foreground=fg, insertcolor=fg, bordercolor=hl, lightcolor=bg, darkcolor=bg)
            style.map('TEntry', fieldbackground=[('focus', ent), ('!focus', ent)])
            
            style.configure('TCombobox', fieldbackground=ent, background=bg, foreground=fg, arrowcolor=fg, bordercolor=hl, lightcolor=bg, darkcolor=bg)
            style.map('TCombobox', 
                      fieldbackground=[('readonly', ent), ('!readonly', ent), ('disabled', bg)], 
                      selectbackground=[('readonly', hl), ('!readonly', hl)], 
                      selectforeground=[('readonly', fg), ('!readonly', fg)],
                      background=[('readonly', bg), ('!readonly', bg)])
                      
            self.option_add('*TCombobox*Listbox.background', ent)
            self.option_add('*TCombobox*Listbox.foreground', fg)
            self.option_add('*TCombobox*Listbox.selectBackground', hl)
            self.option_add('*TCombobox*Listbox.selectForeground', fg)
            self.option_add('*TCombobox*Listbox.borderWidth', "0")
            self.option_add('*TCombobox*Listbox.highlightThickness', "0")
            
            style.configure('TLabelframe', background=bg, foreground=fg, bordercolor=hl, lightcolor=hl, darkcolor=hl)
            style.configure('TLabelframe.Label', background=bg, foreground=fg)
            style.configure('Horizontal.TScrollbar', background=hl, troughcolor=bg, bordercolor=hl, lightcolor=hl, darkcolor=hl, arrowcolor=fg)
            style.configure('Vertical.TScrollbar', background=hl, troughcolor=bg, bordercolor=hl, lightcolor=hl, darkcolor=hl, arrowcolor=fg)
            
            style.configure('TRadiobutton', background=bg, foreground=fg, indicatorcolor=ent, indicatorbackground=ent, lightcolor=bg, darkcolor=bg)
            style.map('TRadiobutton', background=[('active', bg)], foreground=[('active', fg)], indicatorcolor=[('selected', hl)])
            
            style.configure('TCheckbutton', background=bg, foreground=fg, indicatorcolor=ent, lightcolor=bg, darkcolor=bg)
            style.map('TCheckbutton', background=[('active', bg)], foreground=[('active', fg)], indicatorcolor=[('selected', hl)])
            
            style.configure('TMenubutton', background=ent, foreground=fg, bordercolor=bg, lightcolor=bg, darkcolor=bg)
            style.map('TMenubutton', background=[('active', hl)], foreground=[('active', fg)])
            
            style.configure('TNotebook', background=bg, bordercolor=bg, lightcolor=bg, darkcolor=bg)
            style.configure('TNotebook.Tab', background=ent, foreground=fg, bordercolor=bg, lightcolor=bg, darkcolor=bg)
            style.map('TNotebook.Tab', background=[('selected', hl)])
            
        else:
            style.theme_use('default')
            style.configure('.', background=bg, foreground=fg)
            style.configure('TFrame', background=bg)
            style.configure('TLabel', background=bg, foreground=fg)
            
            style.configure('TEntry', fieldbackground=ent, foreground=fg, insertcolor=fg)
            style.map('TEntry', fieldbackground=[('focus', ent), ('!focus', ent)])
            
            style.configure('TCombobox', fieldbackground=ent, background=bg, foreground=fg, arrowcolor=fg)
            style.map('TCombobox', 
                      fieldbackground=[('readonly', ent), ('!readonly', ent), ('disabled', bg)], 
                      selectbackground=[('readonly', hl), ('!readonly', hl)], 
                      selectforeground=[('readonly', fg), ('!readonly', fg)],
                      background=[('readonly', bg), ('!readonly', bg)])
                      
            self.option_add('*TCombobox*Listbox.background', ent)
            self.option_add('*TCombobox*Listbox.foreground', fg)
            self.option_add('*TCombobox*Listbox.selectBackground', hl)
            self.option_add('*TCombobox*Listbox.selectForeground', fg)
            self.option_add('*TCombobox*Listbox.borderWidth', "1")
            
            style.configure('TLabelframe', background=bg, foreground=fg)
            style.configure('TLabelframe.Label', background=bg, foreground=fg)
            style.configure('Horizontal.TScrollbar', background=hl, troughcolor=bg)
            style.configure('Vertical.TScrollbar', background=hl, troughcolor=bg)
            
            style.configure('TRadiobutton', background=bg, foreground=fg)
            style.map('TRadiobutton', background=[('active', bg)], foreground=[('active', fg)])
            
            style.configure('TCheckbutton', background=bg, foreground=fg)
            style.map('TCheckbutton', background=[('active', bg)], foreground=[('active', fg)])
            
            style.configure('TMenubutton', background=ent, foreground=fg)
            style.map('TMenubutton', background=[('active', hl)], foreground=[('active', fg)])
            
            style.configure('TNotebook', background=bg)
            style.configure('TNotebook.Tab', background=ent, foreground=fg)
            style.map('TNotebook.Tab', background=[('selected', hl)])
        
        self.apply_theme_to_child(self)
        
        self.update_idletasks() 
        self.update_palette_images()
        self.refresh_all_displays()

    def clear_all_cursors(self):
        for p in ["P1", "P2"]:
            for i in range(len(self.data[p]["combos"])):
                if self.data[p]["cursors"][i] is not None:
                    self.data[p]["cursors"][i] = None
                    self.refresh_displays(p, i, update_pins=False)

    def set_cursor(self, p, idx, pos):
        self.clear_all_cursors()
        self.data[p]["active_slot"].set(idx)
        self.data[p]["cursors"][idx] = pos
        self.data[p]["canvases"][idx].focus_set()
        self.refresh_displays(p, idx, update_pins=False)

    def animate_cursor(self):
        self.blink_on = not self.blink_on
        char = "|" if self.blink_on else " "
        for p in ["P1", "P2"]:
            for idx, c_id in enumerate(self.data[p]["cursor_widgets"]):
                if c_id is not None:
                    try:
                        self.data[p]["canvases"][idx].itemconfig(c_id, text=char)
                    except tk.TclError:
                        pass
        self.after(500, self.animate_cursor)

    def scroll_to_cursor(self, p, idx):
        canvas = self.data[p]["canvases"][idx]
        c_idx = self.data[p]["cursors"][idx]
        total = max(1, len(self.data[p]["combos"][idx]))
        if c_idx is None or c_idx >= total - 1:
            canvas.xview_moveto(1.0)
        else:
            canvas.xview_moveto(c_idx / total)

    def add_attack(self, key):
        if self.is_input_blocked(): return
        internal_key = key.lower()
        if self.is_dir(internal_key):
            self.add_direction(internal_key)
            return
            
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        ins_pos = c_idx if c_idx is not None else len(combo)
        
        is_any_pk = internal_key in ['any_p', 'any_k', 'h_any_p', 'h_any_k']

        if internal_key == 'newline':
            combo.insert(ins_pos, 'newline')
            if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] += 1
            self.refresh_displays(p, idx)
            self.scroll_to_cursor(p, idx)
            return

        if ins_pos > 0:
            prev = combo[ins_pos - 1]
            if self.is_dir(prev):
                combo.insert(ins_pos, 'plus')
                ins_pos += 1
            elif self.is_atk(prev):
                add_goes_into = True
                if is_any_pk and prev == internal_key:
                    count = 0
                    idx_check = ins_pos - 1
                    while idx_check >= 0 and combo[idx_check] == internal_key:
                        count += 1
                        idx_check -= 1
                    if count < 3: add_goes_into = False
                if add_goes_into:
                    combo.insert(ins_pos, 'goes_into')
                    ins_pos += 1

        combo.insert(ins_pos, internal_key)
        if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] = ins_pos + 1
            
        self.refresh_displays(p, idx)
        self.scroll_to_cursor(p, idx)

    def add_direction(self, key):
        if self.is_input_blocked(): return
        internal_key = key.lower()
        if self.is_atk(internal_key):
            self.add_attack(internal_key)
            return
            
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        ins_pos = c_idx if c_idx is not None else len(combo)
        
        if ins_pos > 0:
            prev = combo[ins_pos - 1]
            if self.is_atk(prev):
                combo.insert(ins_pos, 'goes_into')
                ins_pos += 1

        combo.insert(ins_pos, internal_key)
        
        if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] = ins_pos + 1
        self.refresh_displays(p, idx)
        self.scroll_to_cursor(p, idx)

    def handle_plus_logic(self):
        if self.is_input_blocked(): return
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        ins_pos = c_idx if c_idx is not None else len(combo)
        
        if ins_pos > 0 and combo[ins_pos - 1] in ['goes_into', 'plus']:
            if combo[ins_pos - 1] == 'goes_into': combo[ins_pos - 1] = 'plus'
            else: combo[ins_pos - 1] = 'goes_into'
        else:
            combo.insert(ins_pos, 'plus')
            if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] += 1
            
        self.refresh_displays(p, idx)

    def backspace(self):
        if self.is_input_blocked(): return
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        ins_pos = c_idx if c_idx is not None else len(combo)
        
        if ins_pos > 0:
            combo.pop(ins_pos - 1)
            if self.data[p]["cursors"][idx] is not None: self.data[p]["cursors"][idx] -= 1
            self.refresh_displays(p, idx)

    def clear_active_slot(self):
        if self.is_input_blocked(): return
        p = self.get_active_player()
        idx = self.data[p]["active_slot"].get()
        self.data[p]["combos"][idx] = []
        self.data[p]["cursors"][idx] = None
        self.data[p]["canvases"][idx].xview_moveto(0)
        self.data[p]["combo_texts"][idx].delete("1.0", tk.END)
        self.data[p]["combo_texts"][idx].insert("1.0", f"Combo {idx+1}")
        self.refresh_displays(p, idx)
        
    def clear_all(self):
        if self.is_input_blocked(): return
        p = self.get_active_player()
        if messagebox.askyesno("Confirm", f"Are you sure you want to clear all combos for {p}?"):
            try:
                self._is_loading = True
                for i in range(len(self.data[p]["combos"])):
                    self.data[p]["combos"][i] = []
                    self.data[p]["cursors"][i] = None
                    self.data[p]["canvases"][i].xview_moveto(0)
                    self.data[p]["combo_texts"][i].delete("1.0", tk.END)
                    self.data[p]["combo_texts"][i].insert("1.0", f"Combo {i+1}")
                    self.refresh_preview_window(p, i)
                    if not self.data[p]["justify_pins"].get() and self.data[p]["pinned_windows"][i]:
                        self.refresh_pinned_window(p, i)
                if self.data[p]["justify_pins"].get():
                    self.refresh_master_pin(p)
            finally:
                self._is_loading = False
                self.update_idletasks() 
                for i in range(len(self.data[p]["combos"])):
                    self.update_scrollbar_visibility(p, i)
                self.schedule_tree_refresh(p)

    def pin_all(self, p):
        for i in range(len(self.data[p]["combos"])):
            if not self.data[p]["pinned_vars"][i].get():
                self.data[p]["pinned_vars"][i].set(True)
                self.toggle_pin(p, i, force_refresh=False)
        if self.data[p]["justify_pins"].get():
            self.refresh_master_pin(p)

    def unpin_all(self, p):
        for i in range(len(self.data[p]["combos"])):
            if self.data[p]["pinned_vars"][i].get():
                self.data[p]["pinned_vars"][i].set(False)
                self.toggle_pin(p, i, force_refresh=False)
        if self.data[p]["justify_pins"].get():
            self.refresh_master_pin(p)

    def save_single_combo(self, p, idx):
        name_str = self.data[p]["combo_texts"][idx].get("1.0", "end-1c")
        data = {"name": name_str, "tokens": self.data[p]["combos"][idx]}
        filepath = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON Files", "*.json")], initialfile=f"combo_{idx+1}.json")
        if filepath:
            with open(filepath, 'w') as f: json.dump(data, f, indent=4)

    def load_single_combo(self, p, idx):
        filepath = filedialog.askopenfilename(filetypes=[("JSON Files", "*.json")])
        if filepath:
            try:
                with open(filepath, 'r') as f: data = json.load(f)
                self.data[p]["combo_texts"][idx].delete("1.0", tk.END)
                self.data[p]["combo_texts"][idx].insert("1.0", data.get("name", f"Loaded {idx+1}"))
                self.data[p]["combos"][idx] = data.get("tokens", [])
                self.refresh_displays(p, idx)
                self.schedule_tree_refresh(p)
            except Exception as e: messagebox.showerror("Load Error", str(e))

    def save_all_combos_to_file(self, p, filepath):
        data = {
            "glyph": self.current_glyph.get(),
            "slot_count": len(self.data[p]["combos"]),
            "slots": [
                {
                    "name": self.data[p]["combo_texts"][i].get("1.0", "end-1c"), 
                    "tokens": self.data[p]["combos"][i]
                } for i in range(len(self.data[p]["combos"]))
            ]
        }
        with open(filepath, 'w') as f: json.dump(data, f, indent=4)

    def save_all_combos(self, p):
        filepath = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON Files", "*.json")], initialfile=f"all_combos_{p}.json")
        if filepath:
            self.save_all_combos_to_file(p, filepath)

    def load_all_combos(self, p):
        filepath = filedialog.askopenfilename(filetypes=[("JSON Files", "*.json")])
        if filepath:
            self.load_all_from_path(p, filepath)
            
    def load_all_from_path(self, p, filepath):
        try:
            self._is_loading = True
            with open(filepath, 'r') as f: data = json.load(f)
            
            glyph = data.get("glyph")
            if glyph in GLYPH_SUFFIXES: 
                self.current_glyph.set(glyph)
                self.glyph_mb.config(text=glyph)
            elif glyph in self.custom_glyph_configs: 
                self.current_glyph.set(glyph)
                self.glyph_mb.config(text=glyph)
            
            slots = data.get("slots", [])
            slot_count = data.get("slot_count")
            
            needs_update = False
            if slot_count is None:
                slot_count = 15
                needs_update = True
                
            if len(slots) > slot_count:
                slot_count = len(slots)
                needs_update = True
                
            if slot_count > 250:
                slot_count = 250
                needs_update = True
                messagebox.showinfo("Limit Reached", "The loaded file contained more than 250 combos. It has been truncated to ensure stable performance.")
                
            self.data[p]["slot_count_var"].set(str(slot_count))
            self.apply_slot_count(p)
            
            for i in range(slot_count):
                if i < len(slots):
                    name = slots[i].get("name", f"Combo {i+1}")
                    tokens = slots[i].get("tokens", [])
                else:
                    name = f"Combo {i+1}"
                    tokens = []
                    
                self.data[p]["canvases"][i].xview_moveto(0)
                self.data[p]["combo_texts"][i].delete("1.0", tk.END)
                self.data[p]["combo_texts"][i].insert("1.0", name)
                self.data[p]["combos"][i] = tokens
                
            if needs_update:
                self.save_all_combos_to_file(p, filepath)
                
            self.build_dynamic_macros()
            self.update_palette_images()
            
            for i in range(slot_count):
                self.refresh_displays(p, i, update_pins=False)
                
            if self.data[p]["justify_pins"].get():
                self.refresh_master_pin(p)
            else:
                for i in range(slot_count):
                    if self.data[p]["pinned_windows"][i]:
                        self.refresh_pinned_window(p, i)
                        
            if getattr(self, 'gamepad_viewer', None) and self.gamepad_viewer.winfo_exists():
                self.gamepad_viewer.build_layout()
                        
        except Exception as e: 
            messagebox.showerror("Load Error", str(e))
        finally:
            self._is_loading = False
            self.update_idletasks() 
            for i in range(len(self.data[p]["combos"])):
                self.update_scrollbar_visibility(p, i)
            self.schedule_tree_refresh(p)

    def update_palette_images(self):
        self.standard_btns = [item for item in self.standard_btns if item[0].winfo_exists()]
        self.palette_widgets = [item for item in self.palette_widgets if item[0].winfo_exists()]

        theme = self.active_theme_data
        grad_colors = theme.get("bg_grad")
        
        style = theme.get("palette_style", "Classic")
        use_grad_btn = theme.get("grad_btns_and_highlights", False) and grad_colors is not None
        use_grad_std = theme.get("grad_standard_btns", False) and grad_colors is not None
        
        hl_colors = self.lighten_colors(grad_colors, 40) if (use_grad_btn or use_grad_std) else None
        
        current_bg = theme.get("btn_bg", theme.get("entry_bg", "#1E1F20"))
        current_hl = theme.get("highlight", "#505050")
        current_fg = theme.get("font", "#FFFFFF")
        
        bd_style = "raised" if style == "Classic" else "flat"
        
        for item in self.palette_widgets:
            btn, token, scale, text, w, h, is_macro = item
            
            pil_icon = self.get_icon_pil(token, scale, is_macro=is_macro) 
            
            photo = None
            hl_photo = None
            
            if w and h:
                if use_grad_btn:
                    base_pil = self.get_gradient_pil(w, h, grad_colors)
                else:
                    base_pil = Image.new("RGB", (w, h), current_bg)
                    
                if pil_icon:
                    if is_macro:
                        offset_x = 12
                        offset_y = (h - pil_icon.height) // 2
                    else:
                        offset_x = (w - pil_icon.width) // 2
                        offset_y = (h - pil_icon.height) // 2
                    
                    if pil_icon.mode == 'RGBA':
                        base_pil.paste(pil_icon, (offset_x, offset_y), pil_icon)
                    else:
                        base_pil.paste(pil_icon, (offset_x, offset_y))
                        
                photo = ImageTk.PhotoImage(base_pil)
                
                if use_grad_btn:
                    hl_pil = self.get_gradient_pil(w, h, hl_colors)
                else:
                    hl_pil = Image.new("RGB", (w, h), current_hl)
                    
                if pil_icon:
                    if pil_icon.mode == 'RGBA':
                        hl_pil.paste(pil_icon, (offset_x, offset_y), pil_icon)
                    else:
                        hl_pil.paste(pil_icon, (offset_x, offset_y))
                hl_photo = ImageTk.PhotoImage(hl_pil)

                display_text = f"       {text.strip():<6}" if is_macro else ("" if pil_icon else text)
                
                btn.configure(
                    image=photo, 
                    text=display_text, 
                    compound="center", 
                    width=w, height=h, 
                    bd=1, relief=bd_style, 
                    highlightthickness=0,
                    bg=current_bg, fg=current_fg, activeforeground=current_fg
                )
                self._keep_alive_images[btn] = (photo, hl_photo)
                
                if hasattr(btn, '_hover_enter_id'): btn.unbind("<Enter>", btn._hover_enter_id)
                if hasattr(btn, '_hover_leave_id'): btn.unbind("<Leave>", btn._hover_leave_id)
                
                btn._hover_enter_id = btn.bind("<Enter>", lambda e, b=btn, hp=hl_photo: b.configure(image=hp) if b.winfo_exists() else None, add="+")
                btn._hover_leave_id = btn.bind("<Leave>", lambda e, b=btn, p=photo: b.configure(image=p) if b.winfo_exists() else None, add="+")

        for item in self.standard_btns:
            btn, w, h, text = item
            photo = None
            hl_photo = None
            
            if use_grad_std:
                base_pil = self.get_gradient_pil(w, h, grad_colors)
                photo = ImageTk.PhotoImage(base_pil)
                
                hl_pil = self.get_gradient_pil(w, h, hl_colors) if hl_colors else Image.new("RGB", (w, h), current_hl)
                hl_photo = ImageTk.PhotoImage(hl_pil)
                    
            self._keep_alive_images[btn] = (photo, hl_photo)
            
            btn.configure(
                image=photo if photo else self.dummy_pixel, text=text, compound="center",
                width=w, height=h, bd=1, relief=bd_style, highlightthickness=0,
                bg=current_bg, fg=current_fg, activeforeground=current_fg
            )
            
            if hasattr(btn, '_hover_enter_id'): btn.unbind("<Enter>", btn._hover_enter_id)
            if hasattr(btn, '_hover_leave_id'): btn.unbind("<Leave>", btn._hover_leave_id)
            
            if use_grad_std:
                btn._hover_enter_id = btn.bind("<Enter>", lambda e, b=btn, hp=hl_photo, hl=current_hl: b.configure(image=hp) if hp else b.configure(bg=hl), add="+")
                btn._hover_leave_id = btn.bind("<Leave>", lambda e, b=btn, p=photo, bg=current_bg: b.configure(image=p) if p else b.configure(bg=bg), add="+")
            else:
                btn._hover_enter_id = btn.bind("<Enter>", lambda e, b=btn, hl=current_hl: b.configure(bg=hl) if b.winfo_exists() else None, add="+")
                btn._hover_leave_id = btn.bind("<Leave>", lambda e, b=btn, bg=current_bg: b.configure(bg=bg) if b.winfo_exists() else None, add="+")

    def on_scale_change(self, p):
        try:
            val = float(self.data[p]["current_scale"].get())
            if val <= 0: raise ValueError
        except ValueError:
            self.data[p]["current_scale"].set("1.0") 
        if self.data[p]["justify_pins"].get():
            self.refresh_master_pin(p)
        else:
            for idx in range(len(self.data[p]["combos"])):
                if self.data[p]["pinned_windows"][idx]: 
                    self.refresh_pinned_window(p, idx)

    def on_justify_toggle(self, p):
        if self.data[p]["justify_pins"].get():
            for i in range(len(self.data[p]["combos"])):
                if self.data[p]["pinned_windows"][i]:
                    self.data[p]["pinned_windows"][i].destroy()
                    self.data[p]["pinned_windows"][i] = None
            self.refresh_master_pin(p)
        else:
            if self.data[p]["master_pinned_window"]:
                self.data[p]["master_pinned_window"].destroy()
                self.data[p]["master_pinned_window"] = None
            for i in range(len(self.data[p]["combos"])):
                if self.data[p]["pinned_vars"][i].get():
                    self.data[p]["pinned_windows"][i] = PinnedComboWindow(self, p, i)
                    self.refresh_pinned_window(p, i)
                    
    def on_overlay_toggle(self):
        for p in ["P1", "P2"]:
            if self.data[p]["master_pinned_window"]:
                self.data[p]["master_pinned_window"].destroy()
                self.data[p]["master_pinned_window"] = None
            for i in range(len(self.data[p]["combos"])):
                if self.data[p]["pinned_windows"][i]:
                    self.data[p]["pinned_windows"][i].destroy()
                    self.data[p]["pinned_windows"][i] = None
            if self.data[p]["justify_pins"].get():
                self.refresh_master_pin(p)
            else:
                for i in range(len(self.data[p]["combos"])):
                    if self.data[p]["pinned_vars"][i].get():
                        self.data[p]["pinned_windows"][i] = PinnedComboWindow(self, p, i)
                        self.refresh_pinned_window(p, i)

        # Force the Gamepad Viewer to reload its graphics if it is currently open
        if getattr(self, 'gamepad_viewer', None) and self.gamepad_viewer.winfo_exists():
            self.gamepad_viewer.apply_transparency()
            self.gamepad_viewer.build_layout()

    def toggle_pin(self, p, idx, force_refresh=True):
        if self.data[p]["justify_pins"].get():
            if force_refresh: self.refresh_master_pin(p)
        else:
            is_pinned = self.data[p]["pinned_vars"][idx].get()
            if is_pinned and not self.data[p]["pinned_windows"][idx]:
                self.data[p]["pinned_windows"][idx] = PinnedComboWindow(self, p, idx)
                self.refresh_pinned_window(p, idx)
            elif not is_pinned and self.data[p]["pinned_windows"][idx]:
                self.data[p]["pinned_windows"][idx].destroy()
                self.data[p]["pinned_windows"][idx] = None

    def refresh_all_displays(self):
        for p in ["P1", "P2"]:
            for idx in range(len(self.data[p]["combos"])): 
                self.refresh_preview_window(p, idx)
                if not self.data[p]["justify_pins"].get():
                    if self.data[p]["pinned_windows"][idx]:
                        self.refresh_pinned_window(p, idx)
            if self.data[p]["justify_pins"].get():
                self.refresh_master_pin(p)
            self.schedule_tree_refresh(p)

    def refresh_displays(self, p, idx, update_pins=True):
        self.refresh_preview_window(p, idx)
        if update_pins:
            if self.data[p]["justify_pins"].get():
                if self.data[p]["pinned_vars"][idx].get():
                    self.refresh_master_pin(p)
            else:
                if self.data[p]["pinned_windows"][idx]:
                    self.refresh_pinned_window(p, idx)

    def update_scrollbar_visibility(self, p, idx):
        if getattr(self, '_is_loading', False): return
        combo = self.data[p]["combos"][idx]
        canvas = self.data[p]["canvases"][idx]
        scrollbar = self.data[p]["scrollbars"][idx]
        
        if not combo:
            scrollbar.grid_remove()
            canvas.xview_moveto(0)
            canvas.configure(scrollregion=(0,0,0,0))
            return
            
        scrollregion = canvas.cget("scrollregion")
        if not scrollregion:
            scrollbar.grid_remove()
            canvas.xview_moveto(0)
            return
            
        scroll_vals = scrollregion.split()
        scrollregion_width = float(scroll_vals[2])
        visible_width = canvas.winfo_width()
        
        if scrollregion_width > visible_width and visible_width > 1:
            scrollbar.grid(row=1, column=0, sticky="ew")
        else:
            scrollbar.grid_remove()
            canvas.xview_moveto(0)

    def refresh_preview_window(self, p, idx):
        canvas = self.data[p]["canvases"][idx]
        theme = self.active_theme_data
        bg_color, fg_color, hl_color = theme["bg"], theme["font"], theme["highlight"]
        
        canvas.delete("all")
        canvas.configure(bg=bg_color)
        
        if "images" not in self.data[p]:
            self.data[p]["images"] = {}
        self.data[p]["images"][idx] = []
        
        use_grad_hl = theme.get("grad_btns_and_highlights", False) and "bg_grad" in theme
        hl_colors = self.lighten_colors(theme["bg_grad"], 40) if use_grad_hl else None
        
        combo = self.data[p]["combos"][idx]
        c_idx = self.data[p]["cursors"][idx]
        
        x, y = 5, 14
        max_x = 5
        row_h = 30
        
        if "token_bboxes" not in self.data[p]:
            self.data[p]["token_bboxes"] = {}
        bboxes = []
        
        font_token = ("Arial", 9, "bold")
        font_cursor = ("Arial", 12, "bold")
        
        if c_idx == 0:
            cursor_id = canvas.create_text(x, y, text="|" if self.blink_on else " ", font=font_cursor, fill=fg_color, anchor="w")
            self.data[p]["cursor_widgets"][idx] = cursor_id
            x += 10
        elif c_idx is None:
            self.data[p]["cursor_widgets"][idx] = None
            
        for i, token in enumerate(combo):
            start_x = x
            if token == 'newline':
                x = 5
                y += row_h
                bboxes.append((start_x, start_x + 20, y - row_h, y))
            else:
                img = self.get_icon(token, scale_factor=0.6) 
                if img:
                    canvas.create_image(x, y, image=img, anchor="w")
                    self.data[p]["images"][idx].append(img)
                    x += img.width() + 2
                    bboxes.append((start_x, x, y - 15, y + 15))
                else:
                    text_repr = TEXT_MAP.get(token, token)
                    btn_bg = hl_color if self.is_atk(token) else bg_color
                    
                    t_id = canvas.create_text(x + 3, y, text=text_repr, font=font_token, fill=fg_color, anchor="w")
                    bbox = canvas.bbox(t_id)
                    
                    if use_grad_hl and self.is_atk(token):
                        rect_w = bbox[2] - x + 6
                        rect_h = 20
                        grad_pil = self.get_gradient_pil(rect_w, rect_h, hl_colors)
                        grad_photo = ImageTk.PhotoImage(grad_pil)
                        self.data[p]["images"][idx].append(grad_photo)
                        bg_id = canvas.create_image(x, y - 10, image=grad_photo, anchor="nw")
                    else:
                        bg_id = canvas.create_rectangle(x, y - 10, bbox[2] + 3, y + 10, fill=btn_bg, outline=fg_color)
                        
                    canvas.tag_lower(bg_id, t_id)
                    
                    x = bbox[2] + 6
                    bboxes.append((start_x, x, y - 15, y + 15))
            
            if x > max_x: max_x = x
            
            if c_idx == i + 1:
                cursor_id = canvas.create_text(x, y, text="|" if self.blink_on else " ", font=font_cursor, fill=fg_color, anchor="w")
                self.data[p]["cursor_widgets"][idx] = cursor_id
                x += 10
                
        self.data[p]["token_bboxes"][idx] = bboxes
        
        calc_height = max(28, y + 14)
        
        if theme.get("grad_combos", False) and "bg_grad" in theme:
            grad_w = max(1100, max_x + 50)
            grad_img_pil = self.get_gradient_pil(grad_w, calc_height, theme["bg_grad"])
            grad_photo = ImageTk.PhotoImage(grad_img_pil)
            self.data[p]["images"][idx].append(grad_photo)
            bg_id = canvas.create_image(0, 0, image=grad_photo, anchor="nw")
            canvas.tag_lower(bg_id)
            
        canvas.configure(height=calc_height)
        canvas.configure(scrollregion=(0, 0, max_x + 20, calc_height))
        
        if not getattr(self, '_is_loading', False):
            self.update_scrollbar_visibility(p, idx)

    def refresh_pinned_window(self, p, idx):
        window = self.data[p]["pinned_windows"][idx]
        if not window: return
        try: scale_factor = float(self.data[p]["current_scale"].get())
        except ValueError: scale_factor = 1.0
        theme = self.active_theme_data
        theme_fg = theme["font"]
        canvas = window.canvas
        canvas.delete("all")
        window.images.clear() 
        raw_name = self.data[p]["combo_texts"][idx].get("1.0", "end-1c").strip()
        is_child = raw_name.startswith("[>]")
        combo_name = raw_name[3:].strip() if is_child else raw_name
        pad = 10.0 * scale_factor
        half_pad = 5.0 * scale_factor
        gap = 4.0 * scale_factor
        y = pad
        max_x = pad
        if combo_name:
            font_title = ("Arial", max(8, int(14 * scale_factor)), "bold")
            t_id = canvas.create_text(pad, y, text=combo_name, font=font_title, fill=theme_fg, anchor="nw")
            bbox = canvas.bbox(t_id)
            y = bbox[3] + half_pad
            max_x = bbox[2]
        combo = list(self.data[p]["combos"][idx])
        current_x = float(pad)
        font_token = ("Arial", max(8, int(12 * scale_factor)), "bold")
        row_h = 40.0 * scale_factor
        if combo:
            for token in combo:
                if token == 'newline':
                    current_x = float(pad)
                    y += row_h + half_pad
                    continue
                img = self.get_icon(token, scale_factor=scale_factor, is_pinned=True)
                if img:
                    canvas.create_image(current_x, y + (row_h / 2.0), image=img, anchor="w")
                    window.images.append(img)
                    current_x += img.width() + gap
                else:
                    text_repr = TEXT_MAP.get(token, token)
                    t_id = canvas.create_text(current_x, y + (row_h / 2.0), text=text_repr, font=font_token, fill=theme_fg, anchor="w")
                    bbox = canvas.bbox(t_id)
                    current_x += (bbox[2] - bbox[0]) + gap
                if current_x > max_x:
                    max_x = current_x
            total_w = int(max_x + pad)
            total_h = int(y + row_h + pad)
        else:
            total_w = int(max_x + pad)
            total_h = int(y + half_pad)
            
        current_w = window.winfo_width()
        current_h = window.winfo_height()
        target_w = max(current_w, total_w)
        target_h = max(current_h, total_h)
        
        # PATCH: Wrap sizing logic
        if self.modern_overlay_var.get():
            target_w = total_w
            target_h = total_h
        else:
            chunk = max(20, int(100 * scale_factor))
            shrink_chunk = max(30, int(150 * scale_factor))
            if total_w > current_w: target_w = total_w + chunk
            if total_h > current_h: target_h = total_h + chunk
            if total_w < current_w - shrink_chunk: target_w = total_w
            if total_h < current_h - shrink_chunk: target_h = total_h
            
        target_w = max(int(pad), target_w)
        target_h = max(int(pad), target_h)
        if current_w != target_w or current_h != target_h:
            window.geometry(f"{target_w}x{target_h}")
            
        # PATCH: Ensure backgrounds/gradients are only drawn when toggled on
        if self.modern_overlay_var.get():
            if theme.get("grad_pinned", True) and "bg_grad" in theme:
                img = Image.new("RGB", (2, 2))
                rgbs = [tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) for h in theme["bg_grad"]]
                img.putpixel((0, 0), rgbs[0])
                img.putpixel((1, 0), rgbs[1])
                img.putpixel((0, 1), rgbs[2])
                img.putpixel((1, 1), rgbs[3])
                img = img.resize((target_w, target_h), Image.Resampling.BICUBIC)
                photo = ImageTk.PhotoImage(img)
                window.bg_image = photo 
                bg_id = canvas.create_image(0, 0, image=photo, anchor="nw")
                canvas.tag_lower(bg_id)
                bw = max(1, int(2 * scale_factor))
                b_id = canvas.create_rectangle(bw, bw, target_w-bw, target_h-bw, outline=theme_fg, width=bw)
                canvas.tag_lower(b_id)
            else:
                bg_id = canvas.create_rectangle(0, 0, target_w, target_h, fill=theme["bg"], outline="")
                canvas.tag_lower(bg_id)

    def refresh_master_pin(self, p):
        any_pinned = any(self.data[p]["pinned_vars"][i].get() for i in range(len(self.data[p]["combos"])))
        if not any_pinned:
            if self.data[p]["master_pinned_window"]:
                self.data[p]["master_pinned_window"].destroy()
                self.data[p]["master_pinned_window"] = None
            return
        if not self.data[p]["master_pinned_window"]:
            self.data[p]["master_pinned_window"] = MasterPinnedWindow(self, p)
        window = self.data[p]["master_pinned_window"]
        try: scale_factor = float(self.data[p]["current_scale"].get())
        except ValueError: scale_factor = 1.0
        theme = self.active_theme_data
        theme_fg = theme["font"]
        canvas = window.canvas
        canvas.delete("all")
        window.images.clear() 
        pad = 10.0 * scale_factor
        half_pad = 5.0 * scale_factor
        gap = 4.0 * scale_factor
        y = pad
        max_w = pad * 2.0
        font_title = ("Arial", max(8, int(14 * scale_factor)), "bold")
        font_token = ("Arial", max(8, int(12 * scale_factor)), "bold")
        row_h = 40.0 * scale_factor
        last_parent_y = -1
        for idx in range(len(self.data[p]["combos"])):
            if not self.data[p]["pinned_vars"][idx].get(): continue
            raw_name = self.data[p]["combo_texts"][idx].get("1.0", "end-1c").strip()
            is_child = raw_name.startswith("[>]")
            combo_name = raw_name[3:].strip() if is_child else raw_name
            base_x = pad
            if is_child:
                base_x = pad + (30.0 * scale_factor)
                spine_x = pad + (8.0 * scale_factor)
                branch_y = y + (12.0 * scale_factor)
                if last_parent_y != -1:
                    canvas.create_line(spine_x, last_parent_y, spine_x, branch_y, fill=theme_fg, width=max(1, int(2 * scale_factor)))
                    last_parent_y = branch_y
                canvas.create_line(spine_x, branch_y, base_x - 5, branch_y, fill=theme_fg, width=max(1, int(2 * scale_factor)))
            if combo_name:
                t_id = canvas.create_text(base_x, y, text=combo_name, font=font_title, fill=theme_fg, anchor="nw")
                bbox = canvas.bbox(t_id)
                y = bbox[3] + max(1, int(2 * scale_factor))
                if bbox[2] > max_w: max_w = bbox[2]
            current_x = float(base_x)
            combo = self.data[p]["combos"][idx]
            if combo:
                for token in combo:
                    if token == 'newline':
                        current_x = float(base_x)
                        y += row_h + half_pad
                        continue
                    img = self.get_icon(token, scale_factor=scale_factor, is_pinned=True)
                    if img:
                        canvas.create_image(current_x, y + (row_h / 2.0), image=img, anchor="w")
                        window.images.append(img)
                        current_x += img.width() + gap
                    else:
                        text_repr = TEXT_MAP.get(token, token)
                        t_id = canvas.create_text(current_x, y + (row_h / 2.0), text=text_repr, font=font_token, fill=theme_fg, anchor="w")
                        bbox = canvas.bbox(t_id)
                        current_x += (bbox[2] - bbox[0]) + gap
                    if current_x > max_w:
                        max_w = current_x
                if not is_child:
                    last_parent_y = y + row_h
                y += row_h + pad
            else:
                if not is_child:
                    last_parent_y = y
                y += pad
        total_w = int(max_w + pad)
        total_h = int(y)
        current_w = window.winfo_width()
        current_h = window.winfo_height()
        target_w = max(current_w, total_w)
        target_h = max(current_h, total_h)
        
        # PATCH: Wrap sizing logic
        if self.modern_overlay_var.get():
            target_w = total_w
            target_h = total_h
        else:
            chunk = max(20, int(100 * scale_factor))
            shrink_chunk = max(30, int(150 * scale_factor))
            if total_w > current_w: target_w = total_w + chunk
            if total_h > current_h: target_h = total_h + chunk
            if total_w < current_w - shrink_chunk: target_w = total_w
            if total_h < current_h - shrink_chunk: target_h = total_h
            
        target_w = max(int(pad), target_w)
        target_h = max(int(pad), target_h)
        if current_w != target_w or current_h != target_h:
            window.geometry(f"{target_w}x{target_h}")
            
        # PATCH: Ensure backgrounds/gradients are only drawn when toggled on
        if self.modern_overlay_var.get():
            if theme.get("grad_pinned", True) and "bg_grad" in theme:
                img = Image.new("RGB", (2, 2))
                rgbs = [tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) for h in theme["bg_grad"]]
                img.putpixel((0, 0), rgbs[0])
                img.putpixel((1, 0), rgbs[1])
                img.putpixel((0, 1), rgbs[2])
                img.putpixel((1, 1), rgbs[3])
                img = img.resize((target_w, target_h), Image.Resampling.BICUBIC)
                photo = ImageTk.PhotoImage(img)
                window.bg_image = photo 
                bg_id = canvas.create_image(0, 0, image=photo, anchor="nw")
                canvas.tag_lower(bg_id)
                bw = max(1, int(2 * scale_factor))
                b_id = canvas.create_rectangle(bw, bw, target_w-bw, target_h-bw, outline=theme_fg, width=bw)
                canvas.tag_lower(b_id)
            else:
                bg_id = canvas.create_rectangle(0, 0, target_w, target_h, fill=theme["bg"], outline="")
                canvas.tag_lower(bg_id)

if __name__ == "__main__":
    app = ComboTrackerApp()
    app.mainloop()