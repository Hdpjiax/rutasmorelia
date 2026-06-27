import os
import subprocess

def main():
    sql_file = "import_routes.sql"
    if not os.path.exists(sql_file):
        print(f"File {sql_file} not found!")
        return
        
    print("Reading import_routes.sql...")
    with open(sql_file, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Split content by "-- Route: " which marks the start of each route insertion block
    blocks = content.split("-- Route: ")
    header = blocks[0] # The BEGIN; and initial comments
    route_blocks = blocks[1:]
    
    # We will group blocks into chunks to keep file sizes under 500KB
    chunks = []
    current_chunk = []
    current_size = 0
    
    for block in route_blocks:
        block_content = "-- Route: " + block
        # If it's the last block, it might contain "COMMIT;" at the end. We'll strip it and append COMMIT; to each chunk anyway.
        if "COMMIT;" in block_content:
            block_content = block_content.replace("COMMIT;", "")
            
        block_size = len(block_content.encode('utf-8'))
        
        # If adding this block exceeds 500KB, save current chunk and start a new one
        if current_size + block_size > 500 * 1024 and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_size = 0
            
        current_chunk.append(block_content)
        current_size += block_size
        
    if current_chunk:
        chunks.append(current_chunk)
        
    print(f"Split into {len(chunks)} chunks.")
    
    token = "sbp_29ed543ad4b6e7a6a5b5712754a50b1ae695ec3f"
    env = os.environ.copy()
    env["SUPABASE_ACCESS_TOKEN"] = token
    
    for idx, chunk in enumerate(chunks):
        chunk_file = f"import_routes_part_{idx+1}.sql"
        chunk_content = "BEGIN;\n" + "\n".join(chunk) + "\nCOMMIT;"
        
        with open(chunk_file, "w", encoding="utf-8") as f:
            f.write(chunk_content)
            
        print(f"Running chunk {idx+1}/{len(chunks)} ({chunk_file}, size: {len(chunk_content.encode('utf-8'))} bytes)...")
        
        # Run supabase query
        try:
            # We use powershell to run it or subprocess directly
            res = subprocess.run(
                ["npx", "supabase", "db", "query", "--linked", "-f", chunk_file],
                env=env,
                capture_output=True,
                text=True,
                shell=True
            )
            if res.returncode == 0:
                print(f"Chunk {idx+1} successfully executed.")
            else:
                print(f"Chunk {idx+1} failed with code {res.returncode}")
                print("Error:", res.stderr)
                print("Output:", res.stdout)
                break
        except Exception as e:
            print(f"Error running chunk {idx+1}: {e}")
            break
        finally:
            # Clean up the temp chunk file
            if os.path.exists(chunk_file):
                os.remove(chunk_file)
                
    print("Done importing all chunks!")

if __name__ == "__main__":
    main()
