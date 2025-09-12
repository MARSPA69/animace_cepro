import os
import requests
import numpy as np
import cv2
import rasterio
from rasterio.transform import from_origin
from pyproj import Transformer
import zipfile
import io
from bs4 import BeautifulSoup
import matplotlib.pyplot as plt
from skimage import io as skio

# 1. Download Atom feed and parse tile information
def get_tile_info():
    atom_url = "https://atom.cuzk.gov.cz/OI/OI.xml"
    response = requests.get(atom_url)
    soup = BeautifulSoup(response.content, 'xml')
    
    tiles = {}
    for entry in soup.find_all('entry'):
        title = entry.title.text
        if 'dlaždice:' in title:
            tile_id = title.split(':')[-1].strip()
            polygon = entry.find('georss:polygon').text
            coords = list(map(float, polygon.split()))
            tiles[tile_id] = coords
    return tiles

# 2. Download tiles
def download_tiles(tile_names):
    base_url = "https://atom.cuzk.gov.cz/OI/datasetFeeds/"
    tiles = {}
    
    for tile_name in tile_names:
        # Get tile metadata
        tile_url = f"{base_url}CZ-00025712-CUZK_OI_{tile_name}.xml"
        response = requests.get(tile_url)
        soup = BeautifulSoup(response.content, 'xml')
        
        # Find ZIP enclosure
        enclosure = soup.find('link', rel="enclosure", type="application/zip")
        if not enclosure:
            continue
            
        # Download and extract ZIP
        zip_url = enclosure['href']
        zip_response = requests.get(zip_url)
        with zipfile.ZipFile(io.BytesIO(zip_response.content)) as z:
            for fname in z.namelist():
                if fname.endswith('.jp2') or fname.endswith('.j2w'):
                    z.extract(fname, f"tiles/{tile_name}")
                    tiles[tile_name] = {
                        'jp2': f"tiles/{tile_name}/{fname}" if fname.endswith('.jp2') else None,
                        'j2w': f"tiles/{tile_name}/{fname}" if fname.endswith('.j2w') else None
                    }
    return tiles

# 3. Read world file and get reference points
def parse_world_file(j2w_path):
    with open(j2w_path, 'r') as f:
        values = [float(line.strip()) for line in f.readlines()]
    return {
        'pixel_size_x': values[0],
        'rotation_y': values[1],
        'rotation_x': values[2],
        'pixel_size_y': values[3],
        'top_left_x': values[4],
        'top_left_y': values[5]
    }

# 4. Convert coordinates
def convert_coordinates(transform, row, col):
    return transform * (col, row)

# 5. Load image and handle white pixels
def process_tile(tile_data, neighbors):
    # Load image
    img = skio.imread(tile_data['jp2'])
    
    # Get world file data
    world_data = parse_world_file(tile_data['j2w'])
    transform = from_origin(
        world_data['top_left_x'], 
        world_data['top_left_y'], 
        world_data['pixel_size_x'], 
        world_data['pixel_size_y']
    )
    
    # Identify white pixels (RGB >= 250)
    white_pixels = np.all(img >= 250, axis=-1)
    
    # Process each white pixel
    height, width = white_pixels.shape
    for y in range(height):
        for x in range(width):
            if white_pixels[y, x]:
                # Get geographic coordinates
                lon, lat = convert_coordinates(transform, y, x)
                
                # Check neighbors
                for neighbor in neighbors:
                    n_img = skio.imread(neighbor['jp2'])
                    n_world = parse_world_file(neighbor['j2w'])
                    n_transform = from_origin(
                        n_world['top_left_x'], 
                        n_world['top_left_y'], 
                        n_world['pixel_size_x'], 
                        n_world['pixel_size_y']
                    )
                    
                    # Convert to neighbor's pixel coordinates
                    inv_transform = ~n_transform
                    nx, ny = [int(round(c)) for c in inv_transform * (lon, lat)]
                    
                    # Validate coordinates and replace pixel
                    if 0 <= nx < n_img.shape[1] and 0 <= ny < n_img.shape[0]:
                        if not np.all(n_img[ny, nx] >= 250):
                            img[y, x] = n_img[ny, nx]
    
    return img

# 6. Homography transformation
def apply_homography(img, src_points, dst_points):
    src_pts = np.array(src_points).reshape(-1, 1, 2)
    dst_pts = np.array(dst_points).reshape(-1, 1, 2)
    
    M, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    return cv2.warpPerspective(img, M, (img.shape[1], img.shape[0]))

# Main processing function
def main():
    # Create directories
    os.makedirs("tiles", exist_ok=True)
    
    # Define tile names (example)
    tile_names = [
        "302_5550", "302_5552", "302_5554",
        "304_5550", "304_5552", "304_5554",
        "306_5550", "306_5552", "306_5554"
    ]
    
    # Download and extract tiles
    tiles = download_tiles(tile_names)
    
    # Process center tile
    center_tile = tiles['304_5552']  # Example center tile
    neighbors = [tiles[name] for name in tile_names if name != '304_5552']
    
    processed_img = process_tile(center_tile, neighbors)
    
    # Save processed image
    skio.imsave("processed_center.jp2", processed_img)
    
    # Homography example (dummy points)
    src_points = [[0, 0], [1, 0], [1, 1], [0, 1]]
    dst_points = [[10, 10], [20, 10], [20, 20], [10, 20]]
    
    transformed_img = apply_homography(processed_img, src_points, dst_points)
    cv2.imwrite("transformed.jpg", transformed_img)

if __name__ == "__main__":
    main()