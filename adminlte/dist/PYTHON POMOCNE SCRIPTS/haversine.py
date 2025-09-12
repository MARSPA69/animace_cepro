#!/usr/bin/env python3
"""
gps_distance.py

Calculate the great‐circle (haversine) distance between two GPS points.
Usage:
  python gps_distance.py --lat1 50.087451 --lon1 14.420671 --lat2 50.075538 --lon2 14.437800
Or, omit any flag to be prompted for input interactively.
"""

import math
import argparse
import sys

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great‐circle distance between two points 
    on the Earth’s surface specified in decimal degrees.
    Returns distance in meters.
    """
    R = 6371000  # Earth radius in meters
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ / 2)**2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2)**2
    return 2 * R * math.asin(math.sqrt(a))

def parse_args():
    p = argparse.ArgumentParser(description="Compute GPS-to-GPS distance in meters.")
    p.add_argument("--lat1", type=float, help="Latitude of point 1 (degrees)")
    p.add_argument("--lon1", type=float, help="Longitude of point 1 (degrees)")
    p.add_argument("--lat2", type=float, help="Latitude of point 2 (degrees)")
    p.add_argument("--lon2", type=float, help="Longitude of point 2 (degrees)")
    return p.parse_args()

def main():
    args = parse_args()

    # Interactive fallback if any arg is missing
    if None in (args.lat1, args.lon1, args.lat2, args.lon2):
        try:
            args.lat1 = float(input("Enter first point latitude (°): "))
            args.lon1 = float(input("Enter first point longitude (°): "))
            args.lat2 = float(input("Enter second point latitude (°): "))
            args.lon2 = float(input("Enter second point longitude (°): "))
        except KeyboardInterrupt:
            sys.exit("\nOperation cancelled by user.")
        except:
            sys.exit("\nInvalid input. Please enter numeric coordinates.")

    dist = haversine(args.lat1, args.lon1, args.lat2, args.lon2)
    print(f"Distance between points: {dist:.2f} meters")

if __name__ == "__main__":
    main()
