# List of directories to process
$directories = @("statement-2022", "statement-2023", "statement-2024")

# Loop through each directory
foreach ($dir in $directories) {
    # Check if the directory exists
    if (Test-Path $dir -PathType Container) {
        # Get all files in the directory
        $files = Get-ChildItem -Path $dir -File
        
        # Loop through each file and rename it
        foreach ($file in $files) {
            $newName = "paypal_" + $file.Name
            Rename-Item -Path $file.FullName -NewName $newName
        }
        
        Write-Output "Renamed files in $dir directory."
    }
    else {
        Write-Output "Directory $dir not found."
    }
}
